import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  emoji: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Automated Code Review',
    emoji: '🔍',
    description: (
      <>
        Detect bugs, security vulnerabilities, and performance issues automatically.
        Get actionable feedback with suggested fixes, not just complaints.
      </>
    ),
  },
  {
    title: 'Test Generation',
    emoji: '🧪',
    description: (
      <>
        Automatically generate unit tests for new and modified code.
        Supports Jest, Vitest, pytest, and Go testing frameworks.
      </>
    ),
  },
  {
    title: 'Smart Reviewer Assignment',
    emoji: '👥',
    description: (
      <>
        Suggest the right reviewers based on code ownership, expertise,
        and workload. Never wait for the wrong person again.
      </>
    ),
  },
  {
    title: 'Risk Assessment',
    emoji: '⚠️',
    description: (
      <>
        Semantic analysis detects breaking changes, API modifications,
        and high-risk areas before they reach production.
      </>
    ),
  },
  {
    title: 'Documentation Updates',
    emoji: '📝',
    description: (
      <>
        Keep documentation in sync with code. Auto-generate JSDoc,
        update READMEs, and flag outdated docs.
      </>
    ),
  },
  {
    title: 'Full Lifecycle',
    emoji: '🔄',
    description: (
      <>
        From PR creation to merge. Analysis, review, feedback loops,
        and merge orchestration—all automated.
      </>
    ),
  },
];

function Feature({title, emoji, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className={styles.featureCard}>
        <div className={styles.featureEmoji}>{emoji}</div>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <Heading as="h2" className="text--center margin-bottom--lg">
          Everything You Need for PR Automation
        </Heading>
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
