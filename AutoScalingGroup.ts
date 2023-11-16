import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface AutoScalingGroupArgs {
    minSize: pulumi.Input<number>;
    maxSize: pulumi.Input<number>;
    desiredCapacity: pulumi.Input<number>;
    launchTemplateId: pulumi.Input<string>;
    launchTemplateVersion: pulumi.Input<string>;
    subnetIds: pulumi.Input<pulumi.Output<string>[]>;
    targetGroupArns: pulumi.Input<pulumi.Output<string>[]>;  
}

export class AutoScalingGroup extends pulumi.ComponentResource {
    public autoScalingGroup: aws.autoscaling.Group;

    constructor(name: string, args: AutoScalingGroupArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:ec2:AutoScalingGroup", name, {}, opts);

        this.autoScalingGroup = new aws.autoscaling.Group(name, {
            minSize: args.minSize,
            maxSize: args.maxSize,
            desiredCapacity: args.desiredCapacity,
            launchTemplate: {
                id: args.launchTemplateId,
                version: args.launchTemplateVersion,
            },
            tags: [
                {
                    key: "Name",
                    value: `${name}-asg`,
                    propagateAtLaunch: true,
                },
            ],
            vpcZoneIdentifiers: args.subnetIds, 
            targetGroupArns: args.targetGroupArns,
        }, { parent: this });


          // Create scale-up policy
        const scaleUpPolicy = new aws.autoscaling.Policy(`${name}-scale-up`, {
            scalingAdjustment: 1,
            adjustmentType: "ChangeInCapacity",
            cooldown: 60,
            autoscalingGroupName: this.autoScalingGroup.name,
        }, { parent: this });

        // Create scale-down policy
        const scaleDownPolicy = new aws.autoscaling.Policy(`${name}-scale-down`, {
            scalingAdjustment: -1,
            adjustmentType: "ChangeInCapacity",
            cooldown: 60,
            autoscalingGroupName: this.autoScalingGroup.name,
        }, { parent: this });

        // Create CloudWatch CPU utilization alarms
        new aws.cloudwatch.MetricAlarm(`${name}-high-cpu`, {
            comparisonOperator: "GreaterThanOrEqualToThreshold",
            evaluationPeriods: 2,
            metricName: "CPUUtilization",
            namespace: "AWS/EC2",
            period: 60,
            statistic: "Average",
            threshold: 5,
            alarmActions: [scaleUpPolicy.arn],
            dimensions: { AutoScalingGroupName: this.autoScalingGroup.name },
        }, { parent: this });

        new aws.cloudwatch.MetricAlarm(`${name}-low-cpu`, {
            comparisonOperator: "LessThanOrEqualToThreshold",
            evaluationPeriods: 2,
            metricName: "CPUUtilization",
            namespace: "AWS/EC2",
            period: 60,
            statistic: "Average",
            threshold: 3,
            alarmActions: [scaleDownPolicy.arn],
            dimensions: { AutoScalingGroupName: this.autoScalingGroup.name },
        }, { parent: this });

        this.registerOutputs({
            autoScalingGroup: this.autoScalingGroup,
        });
    }
}
