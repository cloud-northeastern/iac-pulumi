import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface Route53Args {
    domainName: pulumi.Input<string>;
    recordName: pulumi.Input<string>;
    loadBalancerDnsName: pulumi.Input<string>;
    loadBalancerZoneId: pulumi.Input<string>;
}

export class Route53 extends pulumi.ComponentResource {
    constructor(name: string, args: Route53Args, opts?: pulumi.ComponentResourceOptions) {
        super("custom:network:Route53", name, {}, opts);

        pulumi.all([args.domainName, args.recordName, args.loadBalancerDnsName, args.loadBalancerZoneId])
            .apply(([domainName, recordName, loadBalancerDnsName, loadBalancerZoneId]) => {
                aws.route53.getZone({ name: recordName }, { async: true }).then(zone => {
                    new aws.route53.Record(`${name}-dns-record`, {
                        zoneId: zone.id,
                        name: recordName,
                        type: "A",
                        // ttl: 60,
                        aliases: [{
                            name: loadBalancerDnsName,
                            zoneId: loadBalancerZoneId,
                            evaluateTargetHealth: true,
                        }],
                    }, { parent: this });
                });
            });

        this.registerOutputs({});
    }
}
