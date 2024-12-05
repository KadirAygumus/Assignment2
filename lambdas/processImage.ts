/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  GetObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  PutItemCommand,
  PutItemCommandInput,
} from "@aws-sdk/client-dynamodb";

const s3 = new S3Client();
const dynamoDb = new DynamoDBClient();
const VALID_IMAGE_EXTENSIONS = [".jpeg", ".jpg"]; // Valid extensions
const IMAGE_TABLE_NAME = process.env.IMAGE_TABLE_NAME || ""; // DynamoDB Table Name

export const handler: SQSHandler = async (event) => {
  console.log("Event received: ", JSON.stringify(event));

  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body); // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " ")); // Decode key
        
        console.log(`Processing file: ${srcKey} from bucket: ${srcBucket}`);

        try {
          const fileExtension = getFileExtension(srcKey);
          if (!VALID_IMAGE_EXTENSIONS.includes(fileExtension)) {
            console.error(`Invalid file type: ${fileExtension}`);
            throw new Error(`Unsupported file type: ${fileExtension}`);
          }

          // Add file information to DynamoDB
          const putParams: PutItemCommandInput = {
            TableName: IMAGE_TABLE_NAME,
            Item: {
              fileName: { S: srcKey }, 
            },
          };
          await dynamoDb.send(new PutItemCommand(putParams));
          console.log(`File ${srcKey} successfully added to the DynamoDB table.`);
        } catch (error) {
          console.error(`Error processing file ${srcKey}:`, error);
          throw error; 
        }
      }
    }
  }
};

function getFileExtension(key: string): string {
  const parts = key.split(".");
  return parts.length > 1 ? `.${parts.pop()?.toLowerCase()}` : "";
}
