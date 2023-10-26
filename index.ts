import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const config = new pulumi.Config();

// const region = aws.config.region || "us-east-1";
const vpcCidrBlock = config.require("vpcCidrBlock");

const availabilityZones = aws.getAvailabilityZones({});

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
    const subnetCidrBlocks = [];
    for (let i = 0; i < numSubnets; i++) {
        const subnetIpInt = ipToInt(baseIp) + i * subnetSize;
        const subnetIp = intToIp(subnetIpInt);
        subnetCidrBlocks.push(`${subnetIp}/${newSubnetMask}`);
    }
    return subnetCidrBlocks;
}


// name for the VPC
const vpcDev = config.require("vpcDev");
const vpc = new aws.ec2.Vpc(vpcDev, { cidrBlock: vpcCidrBlock, tags: { Name: vpcDev, }, });

const amiId = config.require("amiId");
const instanceType = config.require("instanceType");
let publicSubnets: aws.ec2.Subnet[] = [];
let privateSubnets: aws.ec2.Subnet[] = [];


const applicationSecurityGroupName = config.require("application-security-group");

const applicationSecurityGroup = new aws.ec2.SecurityGroup(applicationSecurityGroupName, {
    vpcId: vpc.id,
    description: "web app Security",
    tags: { Name: applicationSecurityGroupName },
    ingress: [
        {
            fromPort: 22,
            toPort: 22,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
        },
        {
            fromPort: 80,
            toPort: 80,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
        },
        {
            fromPort: 443,
            toPort: 443,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
        },
        {
            fromPort: 8080,
            toPort: 8080,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
        },
        {
            fromPort: 5432,
            toPort: 5432,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
      // 

      egress: [
        {
            fromPort: 5432,
            toPort: 5432,
            protocol: "tcp",
            // securityGroups: [databaseSecurityGroup.id], 
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
    
});

const igw = config.require("InternetGateway");
const iGT = new aws.ec2.InternetGateway(igw, {
    vpcId: vpc.id,
    tags: { Name: igw, },
});

const publicRouteTable = config.require("publicRouteTableName");
const privateRouteTable = config.require("privateRouteTableName");

const pubRouteTable = new aws.ec2.RouteTable(publicRouteTable, {
    vpcId: vpc.id,
    tags: { Name: publicRouteTable, },
});

const priRouteTable = new aws.ec2.RouteTable(privateRouteTable, {
    vpcId: vpc.id,
    tags: { Name: privateRouteTable, },
});

// Creating subnet
const subnetCidrBlocks = generateSubnetCidrBlocks(vpcCidrBlock, 6);

const pubSubnetName = config.require("public-subnet");
const priSubnetName = config.require("private-subnet");

// Create public and private subnets for each Availability Zone

const createSubnets = async () => {
    const zones = await availabilityZones;
    const selectedZones = zones.names.slice(0, 3);

    const createSubnetPromises = selectedZones.map(async (zone, index) => {

        const pubSubnetTag = `${pubSubnetName}-${index}`;
        const priSubnetTag = `${priSubnetName}-${index}`;

        // Create public subnet
        const publicSubnet = new aws.ec2.Subnet(pubSubnetTag, {
            cidrBlock: subnetCidrBlocks[index],
            availabilityZone: zone,
            vpcId: vpc.id,
            mapPublicIpOnLaunch: true, 
            tags: { Name: pubSubnetTag, },
        });
        publicSubnets.push(publicSubnet);

        // Create private subnet
        const privateSubnet = new aws.ec2.Subnet(priSubnetTag, {
            cidrBlock: subnetCidrBlocks[index + 3],
            availabilityZone: zone,
            vpcId: vpc.id,
            tags: { Name: priSubnetTag, },
        });
        privateSubnets.push(privateSubnet);

        const publicSubnetAssociation = config.require("public-subnet-assoc");
        const privateSubnetAssociation = config.require("private-subnet-assoc");

        // Associate public subnet with the single public route table
        const publicSubnetAssoc = new aws.ec2.RouteTableAssociation(`${publicSubnetAssociation}-${index}`, {
            subnetId: publicSubnet.id,
            routeTableId: pubRouteTable.id,

        });

        // Associate private subnet with the single private route table
        const privateSubnetAssoc = new aws.ec2.RouteTableAssociation(`${privateSubnetAssociation}-${index}`, {
            subnetId: privateSubnet.id,
            routeTableId: priRouteTable.id,
        });
        return { publicSubnets, privateSubnets };

    });
    const createdSubnets = await Promise.all(createSubnetPromises);

    return createdSubnets;

};

const publicRouteName = config.require("public-route");

const publicRoute = new aws.ec2.Route(publicRouteName, {
    routeTableId: pubRouteTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: iGT.id,
});

const public_key = config.require("pub_key");

// const ec2Key = new aws.ec2.KeyPair("cloud-demo", {
//     publicKey: public_key,
// });

(async () => {
    // const publicSubnets= await createSubnets();
    // console.log("Subnets:", publicSubnets);
    const subnetsResult = await createSubnets();
    const publicSubnets = subnetsResult[0].publicSubnets;
    const privateSubnets = subnetsResult[0].privateSubnets;

    const selectedPublicSubnet = publicSubnets.length > 0 ? publicSubnets[0] : null;
    const selectedPrivateSubnet = privateSubnets.length > 0 ? privateSubnets[0] : null;

    // console.log("selectedPublicSubnet:", selectedPublicSubnet);

    if (!selectedPublicSubnet || !selectedPrivateSubnet) {
        console.error("No public or private subnet found. Aborting EC2 and RDS instance creation.");
        return;
    }

    // DB Created

    const databaseSecurityGroupName = config.require("database-security-group");
    const name = config.require("name");
    const dbUserName = config.require("username");
    const dbPassword = config.require("password");
    
    // DB Security
    const databaseSecurityGroup = new aws.ec2.SecurityGroup(databaseSecurityGroupName, {
        vpcId: vpc.id,
        description: "Security group for the RDS instance",
        tags: { Name: databaseSecurityGroupName },
        ingress: [
            {
                fromPort: 5432,
                toPort: 5432,
                protocol: "tcp",
                securityGroups: [applicationSecurityGroup.id],
            },
        ],
    });
    // DB ParameterGroup

    const dbParameterGroupName = config.require("db-parameter-group");
    const dbParameterGroup = new aws.rds.ParameterGroup(dbParameterGroupName, {
        family: "postgres15",
    });

    const dbSubnetGroupName = "my-db-subnet-group";

    const dbSubnetGroup = new aws.rds.SubnetGroup(dbSubnetGroupName, {
        subnetIds: privateSubnets.map(subnet => subnet.id),
    });

    //  RDS instance

    const rdsInstanceName = config.require("my-rds-instance");
    const rdsInstance = new aws.rds.Instance(rdsInstanceName, {
        allocatedStorage: 20, 
        engine: "postgres",
        instanceClass: "db.t3.micro", 
        multiAz: false, // No Multi-AZ deployment
        name: name,
        username: dbUserName,
        password: dbPassword, 
        publiclyAccessible: false,  
        parameterGroupName: dbParameterGroup.name,
        vpcSecurityGroupIds: [databaseSecurityGroup.id], 
        dbSubnetGroupName: dbSubnetGroup.name,
        skipFinalSnapshot: true,
    });


    //  EC2

    const myInstance = new aws.ec2.Instance("my-instance", {
        ami: amiId,
        instanceType: instanceType,
        subnetId: selectedPublicSubnet.id,
        securityGroups: [applicationSecurityGroup.id],
        keyName: "cloud-demo",
        tags: {
            Name: "webApp",
        },

        ebsBlockDevices: [
            {
                deviceName: "/dev/xvda",
                volumeSize: 25,
                volumeType: "gp2",
                deleteOnTermination: true,
            },
        ],

        instanceInitiatedShutdownBehavior: "stop",
        rootBlockDevice: {
            volumeSize: 25,
            volumeType: "gp2",
        },

        userData: pulumi.interpolate`#!/bin/bash
        sudo mkdir -p /opt/webappgroup/env/test
        sudo echo 'Script executed successfully' > /opt/webappgroup/env/user-data-success.log
        mkdir -p /opt/webappgroup/env
        echo 'dbUrl=jdbc:postgres://${rdsInstance.endpoint}/CloudDB?createDatabaseIfNotExist=true' > /opt/webappgroup/env/.env
        echo 'dbUserName=${dbUserName}' >> /opt/webappgroup/env/.env
        echo 'dbPass=${dbPassword}' >> /opt/webappgroup/env/.env
        echo 'Script executed successfully' > /home/admin/user-data-success.log
        cat /home/admin/env/.env | tee -a /home/admin/env-success.log
     `,
    //  echo 'dbPass=${dbPassword}' >> /home/admin/env/.env
    }, {dependsOn: [rdsInstance]});

})();