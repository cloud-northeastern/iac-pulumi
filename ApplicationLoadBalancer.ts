import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface ApplicationLoadBalancerArgs {
    vpcId: pulumi.Input<string>;
    publicSubnetIds: pulumi.Input<pulumi.Output<string>[]>;
    loadBalancerSecurityGroupId: pulumi.Input<string>;
    applicationPort: pulumi.Input<number>;
}

export class ApplicationLoadBalancer extends pulumi.ComponentResource {
    public loadBalancer: aws.lb.LoadBalancer;
    public targetGroup: aws.lb.TargetGroup;
    public listener: aws.lb.Listener;

    constructor(name: string, args: ApplicationLoadBalancerArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:lb:ApplicationLoadBalancer", name, {}, opts);

        // Create Load Balancer
        this.loadBalancer = new aws.lb.LoadBalancer(name, {
            internal: false,
            loadBalancerType: "application",
            securityGroups: [args.loadBalancerSecurityGroupId],
            subnets: args.publicSubnetIds,
            enableDeletionProtection: false,
            tags: {
                Name: `${name}-apploadbalancer`,
            },
        }, { parent: this });

        // Create Target Group
        this.targetGroup = new aws.lb.TargetGroup(`${name}-tg`, {
            port: 8080,
            protocol: "HTTP",
            targetType: "instance",
            vpcId: args.vpcId,
            healthCheck:{
                enabled: true,
                path: '/healthz',
                protocol: 'HTTP',
                port: '8080',
                timeout: 25,
            }
        }, { parent: this });

        // Create Listener
        this.listener = new aws.lb.Listener(`${name}-listener`, {
            loadBalancerArn: this.loadBalancer.arn,
            port: 80,
            protocol: "HTTP",
            defaultActions: [{
                type: "forward",
                targetGroupArn: this.targetGroup.arn,
            }],
        }, { parent: this });

        this.registerOutputs({
            loadBalancer: this.loadBalancer,
            targetGroup: this.targetGroup,
            listener: this.listener,
        });
    }
}
