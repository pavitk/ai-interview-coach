#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AiInterviewCoachStack } from './stacks/ai-interview-coach-stack';

const app = new cdk.App();

new AiInterviewCoachStack(app, 'AiInterviewCoachStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'AI Interview Coach - Serverless infrastructure with API Gateway, Lambda, WAF, and S3',
});

app.synth();
