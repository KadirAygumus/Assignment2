/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client();
const VALID_IMAGE_EXTENSIONS = [".jpeg", ".jpg", ".png"]; 

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);        // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      console.log("Record body ", JSON.stringify(snsMessage));
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
        let origimage = null;

        try {
          const fileExtension = getFileExtension(srcKey);
          if (!VALID_IMAGE_EXTENSIONS.includes(fileExtension)) {
            console.error(`Invalid file type: ${fileExtension}`);
            throw new Error(`Unsupported file type: ${fileExtension}`);
          }
  
          // Download the image from the S3 source bucket.
          const params: GetObjectCommandInput = {
            Bucket: srcBucket,
            Key: srcKey,
          };
          origimage = await s3.send(new GetObjectCommand(params));
          // Process the image ......
        } catch (error) {
          console.log(error);
        }
      }
    }
  }
};
function getFileExtension(key: string): string {
  const parts = key.split(".");
  return parts.length > 1 ? `.${parts.pop()?.toLowerCase()}` : "";
}