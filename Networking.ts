import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface NetworkingArgs {
    baseCidrBlock: pulumi.Input<string>;
    destinationcider: pulumi.Input<string>;
}

export class Networking extends pulumi.ComponentResource {
    public vpc: aws.ec2.Vpc;
    public publicSubnets: pulumi.Output<aws.ec2.Subnet[]>;
    public privateSubnets: pulumi.Output<aws.ec2.Subnet[]>;

    constructor(name: string, args: NetworkingArgs, opts?: pulumi.ComponentResourceOptions) {
        super("my:modules:Networking", name, {}, opts);


    function resourceName(identifier: string): string {
    const stackName = pulumi.getStack();
    return `${stackName}-${identifier}`;
}


    // Get the availability zones for the region
    const complete_availabilityZones = pulumi.output(aws.getAvailabilityZones({
        state: "available"
    }));

const availabilityZones = complete_availabilityZones.apply(az => az.names.slice(0, 3));

// Function to calculate the new subnet mask
function calculateNewSubnetMask(vpcMask: number, numSubnets: number): number {
    const bitsNeeded = Math.ceil(Math.log2(numSubnets));
    const newSubnetMask = vpcMask + bitsNeeded;
    return newSubnetMask;
}

function ipToInt(ip: string): number {
    const octets = ip.split('.').map(Number);
    return (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

function intToIp(int: number): string {
    return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

function generateSubnetCidrBlocks(baseCidrBlock: string, numSubnets: number): string[] {
    const [baseIp, vpcMask] = baseCidrBlock.split('/');
    const newSubnetMask = calculateNewSubnetMask(Number(vpcMask), numSubnets);
    const subnetSize = Math.pow(2, 32 - newSubnetMask);
    const subnetCidrBlocks: string[] = [];
    for (let i = 0; i < numSubnets; i++) {
        const subnetIpInt = ipToInt(baseIp) + i * subnetSize;
        const subnetIp = intToIp(subnetIpInt);
        subnetCidrBlocks.push(`${subnetIp}/${newSubnetMask}`);
    }
    return subnetCidrBlocks;
}

// Create a VPC
 this.vpc = new aws.ec2.Vpc("my-vpc", {
    cidrBlock: args.baseCidrBlock,
    enableDnsSupport: true,

      tags: {
        Name: resourceName("my-vpc"),
    },
});
   // Create subnets
const subnetCidrBlocks: pulumi.Output<string[]> = pulumi.output(args.baseCidrBlock).apply(cidrBlock => 
    generateSubnetCidrBlocks(cidrBlock, 6)
);
        this.publicSubnets = pulumi.Output.create(
            availabilityZones.apply(azs =>
                azs.map((az, index) => {
                    const subnet = new aws.ec2.Subnet(`public-subnet-${az}`, {
                        vpcId: this.vpc.id,
                        cidrBlock: subnetCidrBlocks[index],
                        availabilityZone: az,
                        mapPublicIpOnLaunch: true,
                         tags: {
                    Name: resourceName(`public-subnet-${az}`),
                },
                    });
                    return subnet;
                })
            )
        );

        this.privateSubnets = pulumi.Output.create(
            availabilityZones.apply(azs =>
                azs.map((az, index) => {
                    const subnet = new aws.ec2.Subnet(`private-subnet-${az}`, {
                        vpcId: this.vpc.id,
                        cidrBlock: subnetCidrBlocks[index + 3],
                        availabilityZone: az,
                         tags: {
                    Name: resourceName(`private-subnet-${az}`),
                },
                    });
                    return subnet;
                })
            )
        );



// Create an Internet Gateway
const internetGateway = new aws.ec2.InternetGateway("my-internet-gateway", {
    vpcId: this.vpc.id,
     tags: {
        Name: resourceName("my-internet-gateway"),
    },
});

// Create a public route table
const publicRouteTable = new aws.ec2.RouteTable("public-route-table", {
  vpcId: this.vpc.id,
   tags: {
        Name: resourceName("publicRouteTable"),
    },
});


// Attach all public subnets to the public route table
this.publicSubnets.apply(subnets => {
    subnets.forEach((subnet, index) => {
        new aws.ec2.RouteTableAssociation(`public-subnet-rt-association-${index}`, {
            subnetId: subnet.id,
            routeTableId: publicRouteTable.id,
        });
    });
});

// Create a private route table
const privateRouteTable = new aws.ec2.RouteTable("private-route-table", {
    vpcId: this.vpc.id,
     tags: {
        Name: resourceName("privateRouteTable"),
    },
});

// Attach all private subnets to the private route table
this.privateSubnets.apply(subnets => {
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
    destinationCidrBlock: args.destinationcider,
    gatewayId: internetGateway.id,
});

//outputs
this.registerOutputs({
    vpc: this.vpc,
    publicSubnets: this.publicSubnets,
    privateSubnets: this.privateSubnets,
});

    }
}
