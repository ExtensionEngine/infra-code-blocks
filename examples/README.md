Infra code blocks examples.

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Mongo with web server](#mongo-with-web-server)
3. [Database with web server and redis](#database-with-web-server-and-redis)
4. [Static site](#static-site)

### Prerequisites

- Build infra code blocks library:

```bash
$ npm run build
```

- Navigate to example directory and install dependencies:

```bash
$ npm i
```

### Mongo with web server

- Set ENV variables using provided example

- Deploy pulumi project:

```bash
$ pulumi up
```

### Database with web server and redis

- Set ENV variables using provided example

- Deploy pulumi project:

```bash
$ pulumi up
```

### Static site

- Deploy pulumi project:

```bash
$ pulumi up
```

Deploy command will output bucket and service names. Bucket name can be used
to upload static site files.

```
bucket: [BUCKET_NAME]
default: [SERVICE_NAME]
```

- Files are upload to bucket with following command:

```bash
$ S3_SITE_BUCKET=[BUCKET_NAME] npm run deploy
```
