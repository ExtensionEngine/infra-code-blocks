import type { Config } from 'release-it';

export default {
  git: {
    commit: true,
    commitMessage: 'chore: release ${version}',
    tag: true,
    push: true,
  },
  github: {
    release: true,
  },
  npm: {
    publish: true,
  },
  hooks: {
    'after:bump': 'npm run build',
  },
} satisfies Config;
