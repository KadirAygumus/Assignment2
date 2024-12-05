import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // bucket
    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });
    // dynamo db 
    const imageTable = new dynamodb.Table(this, "ImageTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    
    //queues
    const badImageProcessQueue = new sqs.Queue(this, "badImageProcessQueue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: badImageProcessQueue,
        maxReceiveCount: 1,
      },

    });

    //topic

    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    }); 
  
    // Lambda functions
  
    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          IMAGE_TABLE_NAME: imageTable.tableName,
        },
      
      }
    );

    const rejectionMailerFn = new lambdanode.NodejsFunction(this, "RejectionMailerFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
    });
    const confirmationMailerFn = new lambdanode.NodejsFunction(this, "confirmationMailerFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/confirmationMailer.ts`,
    });
    const updateTableFn = new lambdanode.NodejsFunction(this, "updateTableFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/updateTable.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        IMAGE_TABLE_NAME: imageTable.tableName,
      },
    
    });
    
    // S3 --> SQS


    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newImageTopic)  // Changed
    );

    newImageTopic.addSubscription(
      new subs.LambdaSubscription(updateTableFn, {
      })
    );

    //event sources
    const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
      reportBatchItemFailures: true,
    });

    const badImageQueueEventSource = new events.SqsEventSource(
      badImageProcessQueue,
      {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      }
    );

    // policies
    const sesPolicyStatement =   new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
      ],
      resources: ["*"],
    });

    const metadataFilterPolicy = {
      metadata_type: sns.SubscriptionFilter.stringFilter({
        allowlist: ["Caption", "Date", "Photographer"], 
      }),
    };    
    
    //subscriptions and permissions
    newImageTopic.addSubscription(new subs.SqsSubscription(imageProcessQueue,{filterPolicy:metadataFilterPolicy}));
    newImageTopic.addSubscription(new subs.LambdaSubscription(confirmationMailerFn,{filterPolicy:metadataFilterPolicy}));
    newImageTopic.addSubscription(new subs.LambdaSubscription(updateTableFn , {filterPolicy:metadataFilterPolicy}));


    processImageFn.addEventSource(newImageEventSource)   
    rejectionMailerFn.addEventSource(badImageQueueEventSource);


    imagesBucket.grantReadWrite(processImageFn);
    imageTable.grantWriteData(processImageFn);
    imageTable.grantReadWriteData(updateTableFn);

   

    rejectionMailerFn.addToRolePolicy(sesPolicyStatement);
    confirmationMailerFn.addToRolePolicy(sesPolicyStatement);
  
  
    // Output
    
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });

    new cdk.CfnOutput(this, "topicARN", {
      value: newImageTopic.topicArn,
    });

    new cdk.CfnOutput(this, "ImageTableName", { 
        value: imageTable.tableName 
      });

 
  }
}
