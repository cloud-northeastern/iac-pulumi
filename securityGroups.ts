import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface SecurityGroupsArgs {
    vpcId: pulumi.Input<string>;
    applicationPort: pulumi.Input<number>;
    loadBalancerSecurityGroupId: pulumi.Input<string>;

}

export class SecurityGroups extends pulumi.ComponentResource {
    public appSecurityGroupId: pulumi.Output<string>;
    public dbSecurityGroupId: pulumi.Output<string>;

    constructor(name: string, args: SecurityGroupsArgs, opts?: pulumi.ComponentResourceOptions) {
        super("my:modules:SecurityGroups", name, {}, opts);

        // Create Application Security Group
        const appSecurityGroup = new aws.ec2.SecurityGroup("app-sg", {
            vpcId: args.vpcId,
            description: "Assignment webapp security group",
            ingress: [
                { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] },
               // { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
              //  { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
                { protocol: "tcp", fromPort: 8080, toPort: 8080, securityGroups: [args.loadBalancerSecurityGroupId] },
            ],
            egress: [
        {
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"],
        },
    ],
        }, { parent: this });

        // Store appSecurityGroup id for future reference
        this.appSecurityGroupId = appSecurityGroup.id;

            // Create Database Security Group
            const dbSecurityGroup = new aws.ec2.SecurityGroup("db-sg", {
                vpcId: args.vpcId,
                description: "Database security group",
                ingress: [
                    {
                        protocol: "tcp",
                        fromPort: 5432,
                        toPort: 5432,
                        securityGroups: [this.appSecurityGroupId], // Now we only allow the app security group
                    },

            ],
        }, { parent: this });

        // Store dbSecurityGroup id for future reference
        this.dbSecurityGroupId = dbSecurityGroup.id;

        this.registerOutputs({
            appSecurityGroupId: this.appSecurityGroupId,
            dbSecurityGroupId: this.dbSecurityGroupId
        });
    }
}
