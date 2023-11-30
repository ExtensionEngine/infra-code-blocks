import {
  Project,
  StaticSite,
  StaticSiteServiceOptions,
} from '@studion/infra-code-blocks';

const serviceName = 'static-site-example';

const project: Project = new Project('mongo-project', {
  services: [
    {
      type: 'STATIC_SITE',
      serviceName,
    },
  ],
});

export default project.name;

const staticSite = project.services[serviceName] as StaticSite;
export const bucket = staticSite.bucket.id;
