import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
export declare class AiInterviewCoachStack extends cdk.Stack {
    readonly api: apigateway.RestApi;
    readonly webAcl: wafv2.CfnWebACL;
    readonly frontendBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
//# sourceMappingURL=ai-interview-coach-stack.d.ts.map