import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface RDSArgs {
    vpcId: pulumi.Input<string>;
    privateSubnetId: pulumi.Input<pulumi.Output<string>[]>;
    dbSecurityGroupId: pulumi.Input<string>; // Accept the database security group as an argument.
}

export class RDSInstance extends pulumi.ComponentResource {
    public rds: aws.rds.Instance;
    public rdsEndpoint: pulumi.Output<string>;
    public rdsUsername: pulumi.Output<string>;
    public rdsPassword: pulumi.Output<string | undefined>;
   

    constructor(name: string, args: RDSArgs, opts?: pulumi.ComponentResourceOptions) {
        super("my:modules:RDSInstance", name, {}, opts);

         // Fetch the config
        const config = new pulumi.Config("starter");

        // Get the RDS configurations from the config
        const rdsUsernameConfig = config.require("rdsUsername");
        const rdsPasswordConfig = config.require("rdsPassword");
        const rdsDbNameConfig = config.require("rdsDbName");
        const rdsInstanceClassConfig = config.require("rdsInstanceClass");

        const rdsSubnetGroup = new aws.rds.SubnetGroup("rds-subnet-group", {
            subnetIds: args.privateSubnetId,
            tags: {
                Name: "RDS subnet group",
            },
        }, { parent: this });

        const rdsParameterGroup = new aws.rds.ParameterGroup("rds-parameter-group", {
            family: "postgres15",
            description: "DB instance parameter",
            tags: {
                Name: "csye6225-db",
            },
        }, { parent: this });

        this.rds = new aws.rds.Instance("csye6225", {
            engine: "postgres",
            instanceClass: rdsInstanceClassConfig,
            allocatedStorage: 20,
            username: rdsUsernameConfig,
            password: rdsPasswordConfig,
            parameterGroupName: rdsParameterGroup.name,
            vpcSecurityGroupIds: [args.dbSecurityGroupId], 
            skipFinalSnapshot: true,
            publiclyAccessible: false,
            dbSubnetGroupName: rdsSubnetGroup.name,
            multiAz: false,
            dbName: rdsDbNameConfig,
            tags:{
                Name: "csye-6225"
            }
        }, { parent: this });

        const processedEndpoint = this.rds.address.apply(address => address.split(":")[0]);
        this.rds.address.apply(address => {
        const endpoint = address.split(":")[0];
        pulumi.log.info(`Processed RDS Endpoint: ${endpoint}`);
        return endpoint;
        });

        this.rdsEndpoint = this.rds.address;
        this.rdsUsername = this.rds.username;
        this.rdsPassword = this.rds.password;

        this.registerOutputs({
            // rdsEndpoint: this.rds.endpoint,
            rdsEndpoint: this.rdsEndpoint,
            rdsUsername: this.rdsUsername,
            rdsPassword: this.rdsPassword,
        });
    }
}
