import { SNSHandler } from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoDbClient = new DynamoDBClient({});
const IMAGE_TABLE_NAME = process.env.IMAGE_TABLE_NAME || "";

export const handler: SNSHandler = async (event) => {
  try {
    console.log("Received SNS Event:", JSON.stringify(event));

    const snsRecord = event.Records[0];
    const snsMessage = JSON.parse(snsRecord.Sns.Message);
    const metadataType = snsRecord.Sns.MessageAttributes?.metadata_type?.Value; 
    const { id, value } = snsMessage;

    if (!id || !value) {
      throw new Error("Invalid message format: Missing id or value.");
    }

    const putParams = {
      TableName: IMAGE_TABLE_NAME,
      Item: {
        id: { S: id }, 
        [metadataType]: { S: value }, 
      },
    };

    await dynamoDbClient.send(new PutItemCommand(putParams));

    console.log(`Successfully updated metadata '${metadataType}' for image ID: ${id}`);
  } catch (error) {
    console.error("Error processing SNS message:", error);
    throw error; 
  }
};
