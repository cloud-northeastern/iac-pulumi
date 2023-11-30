import * as aws from "@pulumi/aws";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
const config = new pulumi.Config("starter"); 


// Google Service Account
const serviceAccount = new gcp.serviceaccount.Account("csye6225", {
    accountId: "csye6225-service-account",
    displayName: "Service Account",
});

// Service Account Key
const serviceAccountKey = new gcp.serviceaccount.Key("csye6225", {
    serviceAccountId: serviceAccount.name,
});

// IAM role for the Lambda function
const lambdaRole = new aws.iam.Role("lambdaRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "lambda.amazonaws.com",
            },
        }],
    }),
});

// Attach policies to the role
const policy = new aws.iam.Policy("lambdaPolicy", {
    policy: pulumi.output(serviceAccountKey.privateKey).apply(key => JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
          "cloudwatch:PutMetricData",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "ec2:DescribeTags",
          "sns:Publish",
          "lambda:InvokeFunction",
          "lambda:GetFunction",
          "s3:GetObject", // Add this for accessing objects in S3 (assuming releases are stored there)
          "s3:ListBucket", // Add this for listing buckets in S3
          "dynamodb:PutItem",
        ],
    })),
});

new aws.iam.RolePolicyAttachment("lambdaPolicyAttachment", {
    role: lambdaRole.name,
    policyArn: policy.arn,
});


const mailgunApiKey = config.require('mailgunApiKey');
const mailgunDomain = config.require('mailgunDomain')

// Create a Lambda function
const lambdaFunction = new aws.lambda.Function("myFunction", {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./path/to/lambda/code"),
    }),
    role: lambdaRole.arn,
    handler: "index.handler",
    runtime: aws.lambda.NodeJS12dXRuntime,
    environment: {
        variables: {
            GOOGLE_CREDENTIALS: serviceAccountKey.privateKey,
            BUCKET_NAME : 'csye6225-cloud',
            EMAIL_CONFIG: `api_key=${mailgunApiKey}&domain=${mailgunDomain}`,
        },
    },
});

// Create a DynamoDB table
const dynamoDbTable = new aws.dynamodb.Table("myDynamoDbTable", {
  attributes: [{ name: "Id", type: "S" }],
  hashKey: "Id",
  billingMode: "PAY_PER_REQUEST",
});

// Export the name of the bucket
//export const bucketName = csye6225-cloud;

