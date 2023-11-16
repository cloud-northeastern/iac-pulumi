import * as pulumi from "@pulumi/pulumi";
import { Networking } from "./Networking";
import { EC2Instance } from "./ec2";
import { RDSInstance } from "./rds";
import { SecurityGroups } from "./securityGroups";
import { LoadBalancerSecurityGroup } from "./LoadBalancerSecurityGroup";
import { LaunchTemplate } from "./LaunchTemplate";
import { AutoScalingGroup } from "./AutoScalingGroup";
import { Route53 } from "./Route53";
import { ApplicationLoadBalancer } from "./ApplicationLoadBalancer"


//Retrieve base CIDR block from the stack configuration
const config = new pulumi.Config("starter");  
const baseCidrBlock = config.require("baseCidrBlock");
const AmiId = config.require("AmiId");
const applicationPort = config.getNumber("applicationPort") || 8080; 
const destinationcider = config.require("destinationcider")

// Create networking resources (VPC, subnets, etc.)
const networking = new Networking("networking", {
    baseCidrBlock: baseCidrBlock,
    destinationcider: destinationcider,
});

const private_subnetIds = networking.privateSubnets.apply(subnets => subnets.map(subnet => subnet.id));
const public_subnetIds = networking.publicSubnets.apply(subnets => subnets.map(subnet => subnet.id));


// Create Load Balancer Security Group
const loadBalancerSecurityGroup = new LoadBalancerSecurityGroup("myLoadBalancerSecurityGroup", networking.vpc.id);

// Create Security Groups
const securityGroups = new SecurityGroups("securityGroups", {
    vpcId: networking.vpc.id,
    applicationPort: applicationPort,
    loadBalancerSecurityGroupId: loadBalancerSecurityGroup.securityGroup.id
});


// Create RDS instance
const rdsInstance = new RDSInstance("rdsInstance", {
    vpcId: networking.vpc.id,
    privateSubnetId: private_subnetIds,
    dbSecurityGroupId: securityGroups.dbSecurityGroupId
});

// Convert Input<string> to Output<string>, split the endpoint to get the hostname
const rdsHostName = rdsInstance.rds.endpoint.apply(endpoint => {
            return endpoint.split(":")[0];
        });

// Create EC2 instance
const ec2Instance = new EC2Instance("ec2Instance", {
    vpcId: networking.vpc.id,
    publicSubnetId: networking.publicSubnets.apply(subnets => subnets[0].id),
    AmiId: AmiId,
    applicationPort: applicationPort,
    rdsEndpoint: rdsInstance.rdsEndpoint, 
    rdsUsername: rdsInstance.rdsUsername, 
    rdsPassword: rdsInstance.rdsPassword, 
    dbSecurityGroupId: securityGroups.dbSecurityGroupId, 
    appSecurityGroupId: securityGroups.appSecurityGroupId, 
});

// Setup Application Load Balancer
const appLoadBalancer = new ApplicationLoadBalancer("appLoadBalancer", {
    vpcId: networking.vpc.id,
    publicSubnetIds: public_subnetIds,
    loadBalancerSecurityGroupId: loadBalancerSecurityGroup.securityGroup.id,
    applicationPort: applicationPort,
});


const userDataBase64 = pulumi.output(ec2Instance.userData).apply(data => 
    Buffer.from(data).toString('base64')
);

// Use the first public subnet ID for the launch template
const firstPublicSubnetId = networking.publicSubnets.apply(subnets => subnets[0].id);

const launchTemplate = new LaunchTemplate("launchTemplate", {
    iamRoleArn: ec2Instance.iamInstanceProfile.arn, 
    appSecurityGroupId: securityGroups.appSecurityGroupId, 
    userData: userDataBase64, 
    dbSecurityGroupId: securityGroups.dbSecurityGroupId, 
    subnetId: firstPublicSubnetId,  
});


// Create Auto Scaling Group
const autoScalingGroup = new AutoScalingGroup("autoScalingGroup", {
    minSize: 1,
    maxSize: 3,
    desiredCapacity: 1,
    subnetIds: public_subnetIds,
    launchTemplateId: launchTemplate.launchTemplate.id,
    launchTemplateVersion: "$Latest",
    targetGroupArns: [appLoadBalancer.targetGroup.arn], 
});


// Create Route53 DNS record
const profile = config.require("profile");
// Create Route53 DNS record to point to the Application Load Balancer
const dnsRecord = new Route53("route53Record", {
    domainName: `aakashrajawat.me`,
    recordName: `demo.aakashrajawat.me`,
    loadBalancerDnsName: appLoadBalancer.loadBalancer.dnsName,
    loadBalancerZoneId: appLoadBalancer.loadBalancer.zoneId,
});

//exports
export const vpcId = networking.vpc.id;
export const publicSubnetIds = networking.publicSubnets.apply(s => s.map(subnet => subnet.id));
export const privateSubnetIds = networking.privateSubnets.apply(s => s.map(subnet => subnet.id));
// export const ec2InstanceId = ec2Instance.ec2Instance.id;
// export const ec2InstancePublicIp = ec2Instance.ec2Instance.publicIp;
export const lbSecurityGroupId = loadBalancerSecurityGroup.securityGroup.id;