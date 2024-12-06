import { SNSHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    "Please add the SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION environment variables in an env.js file located in the root directory"
  );
}

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

const client = new SESClient({ region: SES_REGION });

export const handler: SNSHandler = async (event) => {
  console.log("Received SNS Event:", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      const snsMessage = JSON.parse(record.Sns.Message);

      if (!snsMessage.Records || snsMessage.Records.length === 0) {
        console.error("Invalid SNS message: Missing Records.");
        throw new Error("Invalid SNS message: Missing Records.");
      }

      for (const messageRecord of snsMessage.Records) {
        try {
          const s3e = messageRecord.s3;

          if (!s3e || !s3e.bucket || !s3e.object) {
            console.error("Invalid S3 structure in SNS message.");
            throw new Error("Invalid S3 structure in SNS message.");
          }

          const srcBucket = s3e.bucket.name;
          const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

          const contactDetails: ContactDetails = {
            name: "The Photo Album",
            email: SES_EMAIL_FROM,
            message: `We received your Image. Its URL is s3://${srcBucket}/${srcKey}`,
          };

          const params = sendEmailParams(contactDetails);
          await client.send(new SendEmailCommand(params));
          console.log(`Confirmation email sent successfully for image: ${srcKey}`);
        } catch (innerError) {
          console.error("Error processing individual S3 record:", innerError);
        }
      }
    } catch (outerError) {
      console.error("Error processing SNS message:", outerError);
    }
  }
};


function sendEmailParams({ name, email, message }: ContactDetails) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent({ name, email, message }),
        },
        // Text: {.           // For demo purposes
        //   Charset: "UTF-8",
        //   Data: getTextContent({ name, email, message }),
        // },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `New image Upload`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  return parameters;
}

function getHtmlContent({ name, email, message }: ContactDetails) {
  return `
    <html>
      <body>
        <h2>Sent from: </h2>
        <ul>
          <li style="font-size:18px">👤 <b>${name}</b></li>
          <li style="font-size:18px">✉️ <b>${email}</b></li>
        </ul>
        <p style="font-size:18px">${message}</p>
      </body>
    </html> 
  `;
}

 // For demo purposes - not used here.
function getTextContent({ name, email, message }: ContactDetails) {
  return `
    Received an Email. 📬
    Sent from:
        👤 ${name}
        ✉️ ${email}
    ${message}
  `;
}