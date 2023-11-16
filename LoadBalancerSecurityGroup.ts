import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export class LoadBalancerSecurityGroup extends pulumi.ComponentResource {
    public securityGroup: aws.ec2.SecurityGroup;

    constructor(name: string, vpcId: pulumi.Input<string>, opts?: pulumi.ComponentResourceOptions) {
        super("custom:lb:LoadBalancerSecurityGroup", name, {}, opts);

        this.securityGroup = new aws.ec2.SecurityGroup(`${name}-lb-sg`, {
            vpcId: vpcId,
            description: "Security group for Load Balancer",
            ingress: [
                {
                    protocol: "tcp",
                    fromPort: 80,
                    toPort: 80,
                    cidrBlocks: ["0.0.0.0/0"],
                },
                {
                    protocol: "tcp",
                    fromPort: 443,
                    toPort: 443,
                    cidrBlocks: ["0.0.0.0/0"],
                },
            ],
            egress: [
                {
                    fromPort: 0,
                    toPort: 0,
                    protocol: "-1",
                    cidrBlocks: ["0.0.0.0/0"],
                },
            ],
            tags: {
                Name: `${name}-lb-sg`,
            },
        }, { parent: this });

        this.registerOutputs({
            securityGroup: this.securityGroup,
        });
    }
}
