import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { Project, next as studion } from '@studion/infra-code-blocks';
import { testConfig } from './config';

const appName = testConfig.mongoTestName;
const stackName = pulumi.getStack();
const tags = {
  Project: appName,
  Environment: stackName,
};

const project = new Project(appName, { services: [] });

const cluster = new aws.ecs.Cluster(
  `${appName}-cluster`,
  {
    name: `${appName}-cluster-${stackName}`,
    tags,
  },
  { parent: project },
);

const basicMongo = new studion.Mongo(`${appName}-basic`, {
  cluster,
  vpc: project.vpc,
  username: testConfig.mongoUser,
  port: testConfig.mongoPort,
  size: 'small',
  image:
    'mongo:7.0.3@sha256:238b1636bdd7820c752b91bec8a669f92568eb313ad89a1fc4a92903c1b40489',
  tags,
});

const testClientContainer = {
  name: 'mongo-test-client',
  image: 'mongo:7.0.3',
  portMappings: [studion.EcsService.createTcpPortMapping(8080)],
  environment: [
    {
      name: 'MONGO_HOST',
      value: pulumi
        .output(basicMongo.service.name)
        .apply(name => `${name}.${name}`),
    },
    {
      name: 'MONGO_PORT',
      value: pulumi.output(basicMongo.port).apply(port => port.toString()),
    },
    { name: 'MONGO_USER', value: basicMongo.username },
    { name: 'MAX_ATTEMPTS', value: '30' },
    { name: 'RETRY_INTERVAL', value: '5' },
    { name: 'CONNECTION_TIMEOUT', value: '10' },
  ],
  secrets: [
    {
      name: 'MONGO_PASSWORD',
      valueFrom: basicMongo.password.secret.arn,
    },
  ],
  command: [
    'sh',
    '-c',
    `
    # Enable command tracing for debugging
    set -x

    # Wait for MongoDB to be ready with improved error handling
    echo 'Waiting for MongoDB to be ready at $MONGO_HOST:$MONGO_PORT...'

    for attempt in $(seq 1 $MAX_ATTEMPTS); do
      echo "Attempt $attempt of $MAX_ATTEMPTS..."

      # Capture command output
      output=$(timeout $CONNECTION_TIMEOUT mongosh --host $MONGO_HOST:$MONGO_PORT \\
              --username $MONGO_USER --password $MONGO_PASSWORD \\
              --eval 'db.runCommand({ping: 1})' --quiet 2>&1)
      status=$?

      if [ $status -eq 0 ]; then
        echo "Successfully connected to MongoDB!"
        break
      elif [ $status -eq 124 ]; then
        echo "Connection attempt timed out after $CONNECTION_TIMEOUT seconds"
      else
        # Check for authentication errors
        if echo "$output" | grep -q "Authentication failed"; then
          echo "Authentication failed. Please check credentials."
          echo "$output"
          exit 2  # Exit immediately - retrying won't help
        elif echo "$output" | grep -qi "connection refused"; then
          echo "Connection refused. MongoDB may not be running yet."
        else
          echo "MongoDB connection failed: $output"
        fi
      fi

      if [ $attempt -lt $MAX_ATTEMPTS ]; then
        echo "Waiting $RETRY_INTERVAL seconds before next attempt..."
        sleep $RETRY_INTERVAL
      else
        echo "Maximum attempts ($MAX_ATTEMPTS) reached. MongoDB is not available."
        exit 3
      fi
    done

    echo 'MongoDB is ready! Testing data persistence...'

    # Insert test data
    mongosh --host $MONGO_HOST:$MONGO_PORT --username $MONGO_USER --password $MONGO_PASSWORD --eval '
      db = db.getSiblingDB("testdb");
      db.testcollection.insertOne({
        testId: "persistence-test-1",
        message: "Hello from v2 Mongo component!",
        timestamp: new Date(),
        testPhase: "initial"
      });

      // Verify insertion
      const result = db.testcollection.findOne({testId: "persistence-test-1"});
      if (result) {
        print("SUCCESS: Test data inserted successfully");
        print("Data:", JSON.stringify(result));
      } else {
        print("ERROR: Failed to insert test data");
        quit(1);
      }
    '

    echo 'Data persistence test completed successfully!'
    # Keep container running for log inspection
    while true; do
      echo 'Test client container is running. Logs can be inspected.'
      sleep 30
    done
    `,
  ],
  essential: true,
};

const testClient = new studion.EcsService(`${appName}-client`, {
  cluster,
  vpc: project.vpc,
  containers: [testClientContainer],
  assignPublicIp: false,
  tags,
});

module.exports = {
  project,
  cluster,
  basicMongo,
  testClient,
};
