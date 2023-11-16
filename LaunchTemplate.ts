import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";


export class LaunchTemplate extends pulumi.ComponentResource {
    public launchTemplate: aws.ec2.LaunchTemplate;

    constructor(name: string, args: {
        iamRoleArn: pulumi.Input<string>,
        appSecurityGroupId: pulumi.Input<string>,
        userData: pulumi.Input<string>,
        dbSecurityGroupId: pulumi.Input<string>,
        subnetId: pulumi.Input<string>
    }, opts?: pulumi.ComponentResourceOptions) {
        super("custom:ec2:LaunchTemplate", name, {}, opts);

        const config = new pulumi.Config("starter");
        const amiId = config.require("AmiId");
        const keyName = config.require("keyName");

        this.launchTemplate = new aws.ec2.LaunchTemplate(name, {
            imageId: amiId,
            instanceType: "t2.micro",
            keyName: keyName,
            userData: args.userData,
            iamInstanceProfile: {
                arn: args.iamRoleArn,
            },
            networkInterfaces: [{
                deviceIndex: 0,
                associatePublicIpAddress: 'true',
                securityGroups: [args.appSecurityGroupId],
                subnetId: args.subnetId,
            }],
            tags: {
                Name: `${name}-lt`,
            },
        }, { parent: this });

        this.registerOutputs({
            launchTemplate: this.launchTemplate,
        });
    }
}

