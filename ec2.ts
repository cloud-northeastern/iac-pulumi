import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
const config = new pulumi.Config("starter");  

export interface EC2Args {
    vpcId: pulumi.Input<string>;
    publicSubnetId: pulumi.Input<string>;
    AmiId: pulumi.Input<string>;
    applicationPort: pulumi.Input<number>;
    rdsEndpoint: pulumi.Input<string>;
    rdsUsername: pulumi.Input<string>;
    rdsPassword: pulumi.Input<string | undefined>;
    dbSecurityGroupId: pulumi.Input<string>;
    appSecurityGroupId: pulumi.Input<string>; 
}


export class EC2Instance extends pulumi.ComponentResource {
    // public ec2Instance: aws.ec2.Instance;
    public publicIp!: pulumi.Output<string>;
    public iamRole: aws.iam.Role;
    public userData!: pulumi.Output<string>;
    public iamInstanceProfile: aws.iam.InstanceProfile;





    constructor(name: string, args: EC2Args, opts?: pulumi.ComponentResourceOptions) {
        super("my:modules:EC2Instance", name, {}, opts);

        // Fetch the config
        const config = new pulumi.Config();


        // Get the keyName from the config
        const keyNameConfig = config.require("keyName");


pulumi.output(args.rdsEndpoint).apply(endpoint => {
    pulumi.log.info(`inside ec2: ${endpoint}`);
});

const mySNSTopic = new aws.sns.Topic("csye6225", {
    displayName: "csye6225"
});

const snsPublishTopicPolicy = new aws.sns.TopicPolicy("snsPublishTopicPolicy", {
    arn: mySNSTopic.arn,
    policy: pulumi.output({
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Principal: "*",
                Action: "sns:Publish",
                Resource: mySNSTopic.arn,
            },
        ],
    }).apply(policyObject => JSON.stringify(policyObject)),
}, { parent: this });


////////////////////


// Google Service Account
const serviceAccount = new gcp.serviceaccount.Account("csye6225", {
    accountId: "csye6225-service-account",
    displayName: "Service Account",
});

// Service Account Key
const serviceAccountKey = new gcp.serviceaccount.Key("csye6225", {
    serviceAccountId: serviceAccount.name,
});

const bucketIAMBinding = new gcp.storage.BucketIAMBinding(
    "bucketIamBinding",
    {
      bucket: 'csye6225-cloud',
      role: "roles/storage.objectAdmin", // Role granting storage.objects.create permission
      members: [
        serviceAccount.email.apply((email) => `serviceAccount:${email}`),
      ],
    }
  );
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
            {
                Action: [
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
                Effect: "Allow",
                Resource: "*",
            },
        ],
    })),
});

new aws.iam.RolePolicyAttachment("lambdaPolicyAttachment", {
    role: lambdaRole.name,
    policyArn: policy.arn,
});

// Create a DynamoDB table
const dynamoDbTable = new aws.dynamodb.Table("myDynamoDbTable", {
    attributes: [{ name: "Id", type: "S" }],
    hashKey: "Id",
    billingMode: "PAY_PER_REQUEST",
  });
  

const mailgunApiKey = config.require('mailgunApiKey');
const mailgunDomain = config.require('mailgunDomain')

// Create a Lambda function
const lambdaFunction = new aws.lambda.Function("myFunction", {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("../serverless"),
    }),
    role: lambdaRole.arn,
    handler: "index.handler",
    runtime: "nodejs14.x",
    environment: {
        variables: {
            GOOGLE_CREDENTIALS: serviceAccountKey.privateKey,
            BUCKET_NAME : 'csye6225-cloud',
            MAILGUN_API_KEY: mailgunApiKey,
            MAILGUN_DOMAIN: mailgunDomain,
            DYNAMODB: dynamoDbTable.name,
        },
    },
});

// Subscribe Lambda function to SNS topic
const lambdaSubscription = new aws.sns.TopicSubscription("lambdaSubscription", {
    protocol: "lambda",
    endpoint: lambdaFunction.arn,
    topic: mySNSTopic.arn,
}, { parent: this });

const snsInvokeLambdaPermission = new aws.lambda.Permission('snsInvokeLambdaPermission', {
    action: 'lambda:InvokeFunction',
    function: lambdaFunction.arn,
    principal: 'sns.amazonaws.com',
    sourceArn: mySNSTopic.arn,
});


// Export the name of the bucket
//export const bucketName = csye6225-cloud;

//////////////////////////



// Userdata to configure environment variables and manage the CloudWatch agent
this.userData = pulumi.interpolate`#!/bin/bash
rm /opt/csye6225/.env
echo "DB_DIALECT: 'postgres'" >> /opt/csye6225/.env
echo "DB_HOST: ${args.rdsEndpoint}" >> /opt/csye6225/.env
echo "DB_USER: csye6225" >> /opt/csye6225/.env
echo "DB_PASSWORD: aakashrajawat" >> /opt/csye6225/.env
echo "DB_POSTGRES: csye6225" >> /opt/csye6225/.env
echo "APP_PORT: 8080" >> /opt/csye6225/.env
echo "SNS_TOPIC_ARN: ${mySNSTopic.arn}" >> /opt/csye6225/.env
sudo chown csye6225:csye6225 /opt/csye6225/.env  
sudo systemctl enable webapp.service 
sudo systemctl restart webapp.service 
sudo systemctl restart webapp.service
sudo chown -R csye6225:csye6225 /opt/csye6225/app.log
sudo chmod -R 770 -R /opt/csye6225/app.log
sudo chown -R csye6225:csye6225 /opt/csye6225/
sudo chmod -R 770 -R /opt/csye6225/ 
sudo ../../../opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/csye6225/cloudwatch-agent.json \
    -s
`;

         // Define the IAM role with CloudWatchAgentServer policy
          this.iamRole = new aws.iam.Role("CloudwatchEC2role", { 
            assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
                Service: "ec2.amazonaws.com",
            }),
        }, { parent: this });

        // const role = new aws.iam.Role("CloudwatchEC2role", {
        //     assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        //         Service: "ec2.amazonaws.com",
        //     }),
        // });

        // Attach the CloudWatchAgentServer policy to the role
        const policyAttachment = new aws.iam.RolePolicyAttachment("CloudWatchAgentServerPolicyAttachment", {
            role: this.iamRole.name,
            policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
        });

        // Create an instance profile for the role
        this.iamInstanceProfile = new aws.iam.InstanceProfile("ec2InstanceProfile", {
            role: this.iamRole.name,
        }, { parent: this });


        this.registerOutputs({
            // ec2Instance: this.ec2Instance,
            publicIp: this.publicIp, 
            iamRole: this.iamRole,
            userData: this.userData,
            iamInstanceProfile: this.iamInstanceProfile,
            lambdaSubscription: lambdaSubscription,


   });
}
}