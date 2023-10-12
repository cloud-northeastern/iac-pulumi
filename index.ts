import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// Base CIDR block
const baseCidrBlock = config.require("vpcCidr");
const [baseFirstOctet, baseSecondOctet] = baseCidrBlock.split('.').slice(0, 2);

// Get the availability zones for the region
const availabilityZones1 = pulumi.output(aws.getAvailabilityZones({
    state: config.get("state")
}));

const availabilityZones = availabilityZones1.apply(az => az.names.slice(0, 3));

// Create a VPC
const vpc = new aws.ec2.Vpc(config.require("vpcName"), {
    cidrBlock: baseCidrBlock,
});

// Create subnets
const publicSubnets = availabilityZones.apply(azs =>
    azs.map((az, index) => {
        const subnet = new aws.ec2.Subnet(`public-subnet-${az}`, {
            vpcId: vpc.id,
            cidrBlock: `${baseFirstOctet}.${baseSecondOctet}.${index + 1}.${config.require("cidrEnd")}`,
            availabilityZone: az,
            mapPublicIpOnLaunch: true,
        });
        return subnet;
    })
);

const privateSubnets = availabilityZones.apply(azs =>
    azs.map((az, index) => {
        const subnet = new aws.ec2.Subnet(`private-subnet-${az}`, {
            vpcId: vpc.id,
            cidrBlock: `${baseFirstOctet}.${baseSecondOctet}.${index + 11}.${config.get("cidrEnd")}`,
            availabilityZone: az,
        });
        return subnet;
    })
);


// Create an Internet Gateway
const internetGateway = new aws.ec2.InternetGateway("my-internet-gateway", {
  vpcId: vpc.id,
});

// Create a public route table
const publicRouteTable = new aws.ec2.RouteTable(config.require("internetGatewayName"), {
  vpcId: vpc.id,
});


// Attach all public subnets to the public route table
publicSubnets.apply(subnets => {
    subnets.forEach((subnet, index) => {
        new aws.ec2.RouteTableAssociation(`public-subnet-rt-association-${index}`, {
            subnetId: subnet.id,
            routeTableId: publicRouteTable.id,
        });
    });
});

// Create a private route table
const privateRouteTable = new aws.ec2.RouteTable(config.require("publicRouteTableName"), {
    vpcId: vpc.id,
});

// Attach all private subnets to the private route table
privateSubnets.apply(subnets => {
    subnets.forEach((subnet, index) => {
        new aws.ec2.RouteTableAssociation(`private-subnet-rt-association-${index}`, {
            subnetId: subnet.id,
            routeTableId: privateRouteTable.id,
        });
    });
});

// Create a public route in the public route table
new aws.ec2.Route("public-route", {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: config.require("publicRouteCidrBlock"),
    gatewayId: internetGateway.id,
});