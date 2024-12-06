import type { DynamoDBStreamHandler } from "aws-lambda";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    "Environment variables SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION must be defined."
  );
}

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

const client = new SESClient({ region: SES_REGION });

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {
    try {
      if (record.eventName === "INSERT") {
        const newImage = record.dynamodb?.NewImage;

        console.log("NewImage:", JSON.stringify(newImage, null, 2));

        if (newImage && newImage.id?.S) {
          const id = newImage.id.S;

          
          const contactDetails: ContactDetails = {
            name: "Image Upload Confirmation",
            email: SES_EMAIL_FROM,
            message: `Your image with ID: ${id} has been successfully uploaded.`,
          };

          const params = sendEmailParams(contactDetails);
          await client.send(new SendEmailCommand(params));

          console.log(`Confirmation email sent successfully for image ID: ${id}`);
        } else {
          console.error("Required field (id) is missing in the DynamoDB record.");
        }
      } else {
        console.log(`Skipping non-INSERT event: ${record.eventName}`);
      }
    } catch (error) {
      console.error("Error processing DynamoDB stream record:", error, record);
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