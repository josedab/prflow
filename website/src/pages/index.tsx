import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <p className={styles.heroDescription}>
          Automate 70% of PR review work. Let AI handle style checks, test coverage, 
          and obvious bugs—so your team can focus on architecture and business logic.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/quickstart">
            Get Started →
          </Link>
          <Link
            className="button button--outline button--lg button--secondary"
            to="https://github.com/josedab/prflow">
            View on GitHub
          </Link>
        </div>
        <div className={styles.installCommand}>
          <code>npx create-prflow@latest</code>
        </div>
      </div>
    </header>
  );
}

function UsedBySection() {
  return (
    <section className={styles.usedBy}>
      <div className="container">
        <Heading as="h2" className="text--center margin-bottom--lg">
          Built for Modern Engineering Teams
        </Heading>
        <div className={styles.badges}>
          <span className={styles.badge}>✓ TypeScript</span>
          <span className={styles.badge}>✓ GitHub Native</span>
          <span className={styles.badge}>✓ Multi-Agent AI</span>
          <span className={styles.badge}>✓ Self-Hostable</span>
        </div>
      </div>
    </section>
  );
}

function QuickDemo() {
  const actionYaml = `name: PRFlow
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  prflow:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: prflow/action@v1
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}`;

  return (
    <section className={styles.quickDemo}>
      <div className="container">
        <div className="row">
          <div className="col col--6">
            <Heading as="h2">One GitHub Action. Full PR Automation.</Heading>
            <p>
              Add PRFlow to your workflow in under 2 minutes. Get automated code reviews, 
              test suggestions, and documentation updates on every pull request.
            </p>
            <ul className={styles.benefitsList}>
              <li>🔍 Semantic change detection and risk assessment</li>
              <li>🐛 Security, performance, and bug detection</li>
              <li>🧪 Automatic unit test generation</li>
              <li>📝 JSDoc and README updates</li>
              <li>👥 Smart reviewer suggestions</li>
            </ul>
          </div>
          <div className="col col--6">
            <CodeBlock language="yaml" title=".github/workflows/prflow.yml">
              {actionYaml}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Intelligent PR Automation"
      description="PRFlow is an end-to-end pull request automation platform. Automate code review, test generation, and documentation updates with multi-agent AI.">
      <HomepageHeader />
      <main>
        <UsedBySection />
        <HomepageFeatures />
        <QuickDemo />
      </main>
    </Layout>
  );
}
