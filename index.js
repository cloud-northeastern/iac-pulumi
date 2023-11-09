const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');


const config = new pulumi.Config();
const awsRegion = config.get('aws-region');
var vpcCIDR = config.require('cidrBlock');
const publicCidrBlock = config.require('publicCidrBlock');
const amiId =config.require('ami_id');
const ownerId =config.require('owner_id');
const iam = require('@pulumi/aws/iam');


console.log(awsRegion, "This is the configured region");

const debianAmi = aws.ec2.getAmi({

    mostRecent: true,
    filters: [
        {
            
             name: "image-id",
             values: [amiId],
            

        },
        {
            name: "virtualization-type",
            values: ["hvm"],
        },
    ],
    owners: [ownerId],
});

aws.getAvailabilityZones({ awsRegion }).then(availableZones => {
    const availabilityZones = availableZones.names.slice(0, 3);
    const vpc = new aws.ec2.Vpc('my-vpc', {

        cidrBlock: vpcCIDR,
        enableDnsSupport: true,
        enableDnsHostnames: true,
        tags: {
            "Name": "MyVPC"
        }
    });

    const internetGw = new aws.ec2.InternetGateway("internetGw", {
        vpcId: vpc.id,
        tags: {
            Name: "createdGateway",
        },
    });

    const publicRouteTable = new aws.ec2.RouteTable('publicRouteTable', {
        vpcId: vpc.id,
        routes: [
            {
                cidrBlock: publicCidrBlock,
                gatewayId: internetGw.id,
            }],
        tags: {
            "Name": "PublicRouteTable"
        },

    });

    const privateRouteTable = new aws.ec2.RouteTable('privateRouteTable', {

        vpcId: vpc.id,
        tags: {

            "Name": "PrivateRouteTable"
        },

    });

    console.log(availabilityZones);

    var i = 1;
    const publicSubnets = [];
    const privateSubnets = [];

    availabilityZones.forEach((az, index) => {

        const thirdOctet = index + 1;
        const publicSubnetCIDR = `${vpcCIDR.split('.')[0]}.${vpcCIDR.split('.')[1]}.${thirdOctet}.0/24`;
        const privateSubnetCIDR = `${vpcCIDR.split('.')[0]}.${vpcCIDR.split('.')[1]}.${(parseInt(thirdOctet) * 10)}.0/24`;
        console.log(publicSubnetCIDR, privateSubnetCIDR)


        const publicSubnet = new aws.ec2.Subnet(`public-subnet-${az}`, {

            vpcId: vpc.id,

            cidrBlock: publicSubnetCIDR,

            availabilityZone: az,

            mapPublicIpOnLaunch: true,

            tags: {

                "Name": `publicSubnet-${i}`

            },

        });

        const publicRouteTableAssociation = new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${az}`, {

            subnetId: publicSubnet.id,
            routeTableId: publicRouteTable.id,

        });



        const privateSubnet = new aws.ec2.Subnet(`private-subnet-${az}`, {
            vpcId: vpc.id,
            cidrBlock: privateSubnetCIDR,
            availabilityZone: az,
            tags: {

                "Name": `privateSubnet-${i}`

            },

        });

        const privateRouteTableAssociation = new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${az}`, {

            subnetId: privateSubnet.id,

            routeTableId: privateRouteTable.id,

        });

        publicSubnets.push(publicSubnet.id);

        privateSubnets.push(privateSubnet.id);

        i = i + 1;

    });
    const appSecurityGroup = new aws.ec2.SecurityGroup('appSecurityGroup', {

        vpcId: vpc.id,
        ingress: [
            {
                protocol: "tcp",
                fromPort: 22,
                toPort: 22,
                cidrBlocks: ["0.0.0.0/0"],
            },
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
            {
                protocol: "tcp",
                fromPort: 8080, //APP_PORT
                toPort: 8080,
                cidrBlocks: ["0.0.0.0/0"],
            },
           {
            protocol: "tcp",
            fromPort: 5432, //database port
            toPort: 5432,
            cidrBlocks: ["0.0.0.0/0"],
           }
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
            "Name": "mySecurityGroups"
        },

    });

    const rdsSecurityGroup = new aws.ec2.SecurityGroup("RDSSecurityGroup", {
        description: "RDS Security Group",
        vpcId: vpc.id,
        ingress: [
            {
                protocol: "tcp",
                fromPort: 5432,
                toPort: 5432,
               securityGroups:[appSecurityGroup.id] 
            },
        ],
        egress: [
            {
                protocol: "tcp",
                fromPort: 5432,
                toPort: 5432,
                securityGroups:[appSecurityGroup.id] 
            },
        ],
    });


    const rdsSubnetGroup = new aws.rds.SubnetGroup("rdssubnetgroup-sg", {
        name: "rds-subnet-group",
        subnetIds: [
        privateSubnets[0],
        privateSubnets[1],
        ],

        description: "Subnet group for the RDS instance",

      });


    const rdsParameterGroup = new aws.rds.ParameterGroup("rds-parameter-group", {
        family: "postgres15",
        
    });



    const dbInstance = new aws.rds.Instance("my-rds-instance", {
        
        
        allocatedStorage: 20, 
        storageType: "gp2", 
        engine: "postgres", 
        instanceClass: "db.t3.micro", 
        multiAz: false, 
        identifier:"csye6225",
        dbName: "csye6225", 
        username: "csye6225", 
        password: "aakashrajawat", 
        parameterGroupName: rdsParameterGroup.name,
        skipFinalSnapshot: true, 
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        // dbSubnetGroupName: privateSubnets[0].name, 
        dbSubnetGroupName:rdsSubnetGroup.name,
        publiclyAccessible: false,
    });


    const rdsEndpoint = dbInstance.endpoint;
    const hostname = rdsEndpoint.apply(endpoint => {

        const parts = endpoint.split(":"); 

        return parts[0]; 

    });
    
    //const ec2RoleName = 'coustomRole';
    const ec2RoleName = 'csye6225';


    const ec2Role = new iam.Role('ec2Role', {

        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                    Service: "ec2.amazonaws.com",
                },
            }],
        }),
    });

    const ec2InstanceProfile = new iam.InstanceProfile('ec2InstanceProfile', {
        name: ec2RoleName,
        role: ec2Role.name,
    });
    
 

    // Attach policies to the custom role as needed
    const policyAttachment = new aws.iam.RolePolicyAttachment("customRoleAttachment", {
        policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy", 
        role: ec2Role.name,
    });


    const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
        ami: debianAmi.then(debianAmi => debianAmi.id),
        instanceType: "t2.micro",
        vpc: vpc.id,
        subnetId: publicSubnets[0],
        keyName: "cloud-demo",
        userData: pulumi.interpolate`#!/bin/bash
        rm /home/webappuser/webapp/.env
        echo "DB_DIALECT: 'postgres'" >> /home/webappuser/webapp/.env
        echo "DB_HOST: ${hostname}" >> /home/webappuser/webapp/.env
        echo "DB_USER: csye6225" >> /home/webappuser/webapp/.env
        echo "DB_PASSWORD: aakashrajawat" >> /home/webappuser/webapp/.env
        echo "DB_POSTGRES: csye6225" >> /home/webappuser/webapp/.env
        echo "APP_PORT: 8080" >> /home/webappuser/webapp/.env
        chown webappuser:webappuser /home/webappuser/webapp/.env  
        sudo systemctl enable webapp.service 
        sudo systemctl restart webapp.service 
        sudo chown -R webappuser:webappuser /var/logs
        sudo chmod -R 770 -R /var/logs 
        sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
            -a fetch-config \
            -m ec2 \
            -c file:/home/webappuser/webapp/cloudwatch-agent.json \
            -s
    `,
        vpcSecurityGroupIds: [appSecurityGroup.id],
        iamInstanceProfile: ec2InstanceProfile.name,
        rootBlockDevice: {
            volumeSize: 25,
            volumeType: "gp2",
            deleteOnTermination: true,
        },
        tags: {
            "Name": "myEC2Instance"
        },

    });


    const hostedZoneId = config.require("hosted-zone-id");

    //const domainName = "aakashrajawat.me";
    const recordName = config.require("domain-name"); 

    const dnsRecord = new aws.route53.Record("dnsRecord", {
        name: recordName,
        type: "A",
        zoneId: hostedZoneId,
        ttl: 60, 
        records: [ec2Instance.publicIp], 
    });

    // Output the DNS record value
    dnsRecord.fqdn.apply(fqdn => {
        console.log(`DNS Record: ${fqdn}`);
    });


});



