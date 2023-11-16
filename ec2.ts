import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

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

// Userdata to configure environment variables and manage the CloudWatch agent
this.userData = pulumi.interpolate`#!/bin/bash
rm /opt/csye6225/.env
echo "DB_DIALECT: 'postgres'" >> /opt/csye6225/.env
echo "DB_HOST: ${args.rdsEndpoint}" >> /opt/csye6225/.env
echo "DB_USER: csye6225" >> /opt/csye6225/.env
echo "DB_PASSWORD: aakashrajawat" >> /opt/csye6225/.env
echo "DB_POSTGRES: csye6225" >> /opt/csye6225/.env
echo "APP_PORT: 8080" >> /opt/csye6225/.env
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

   });
}
}