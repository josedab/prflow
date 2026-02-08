import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

interface DetectedTechnology {
  name: string;
  category: string;
  version?: string;
  confidence: 'high' | 'medium' | 'low';
  detectedFrom: string;
  configFile?: string;
}

interface TechStackResult {
  id: string;
  repository: { owner: string; name: string };
  languages: DetectedTechnology[];
  frameworks: DetectedTechnology[];
  testFramework: DetectedTechnology | null;
  linter: DetectedTechnology | null;
  ci: DetectedTechnology | null;
  packageManager: DetectedTechnology | null;
  projectType: 'monorepo' | 'single_package' | 'multi_project';
  structureHints: {
    hasSourceDir: boolean;
    hasTestDir: boolean;
    hasDocsDir: boolean;
    hasCIConfig: boolean;
    hasDockerfile: boolean;
  };
  detectedAt: Date;
  detectionDurationMs: number;
}

interface GeneratedConfig {
  id: string;
  repository: { owner: string; name: string };
  yamlContent: string;
  sections: Array<{
    key: string;
    label: string;
    description: string;
    source: 'auto_detected' | 'template_default' | 'user_customized';
    editable: boolean;
  }>;
  templateId?: string;
  generatedAt: Date;
}

interface OnboardingSession {
  id: string;
  userLogin: string;
  currentStep: string;
  completedSteps: string[];
  repository: { owner: string; name: string };
  techStack?: TechStackResult;
  generatedConfig?: GeneratedConfig;
  startedAt: Date;
  completedAt?: Date;
}

const FILE_TO_TECH: Record<string, DetectedTechnology> = {
  'package.json': { name: 'Node.js', category: 'language', confidence: 'high', detectedFrom: 'package.json' },
  'tsconfig.json': { name: 'TypeScript', category: 'language', confidence: 'high', detectedFrom: 'tsconfig.json' },
  'pyproject.toml': { name: 'Python', category: 'language', confidence: 'high', detectedFrom: 'pyproject.toml' },
  'go.mod': { name: 'Go', category: 'language', confidence: 'high', detectedFrom: 'go.mod' },
  'Cargo.toml': { name: 'Rust', category: 'language', confidence: 'high', detectedFrom: 'Cargo.toml' },
  'pom.xml': { name: 'Java', category: 'language', confidence: 'high', detectedFrom: 'pom.xml' },
  'next.config.js': { name: 'Next.js', category: 'framework', confidence: 'high', detectedFrom: 'next.config.js' },
  'next.config.ts': { name: 'Next.js', category: 'framework', confidence: 'high', detectedFrom: 'next.config.ts' },
  'vite.config.ts': { name: 'Vite', category: 'framework', confidence: 'high', detectedFrom: 'vite.config.ts' },
  'angular.json': { name: 'Angular', category: 'framework', confidence: 'high', detectedFrom: 'angular.json' },
  'jest.config.js': { name: 'Jest', category: 'test_framework', confidence: 'high', detectedFrom: 'jest.config.js' },
  'jest.config.ts': { name: 'Jest', category: 'test_framework', confidence: 'high', detectedFrom: 'jest.config.ts' },
  'vitest.config.ts': { name: 'Vitest', category: 'test_framework', confidence: 'high', detectedFrom: 'vitest.config.ts' },
  'pytest.ini': { name: 'Pytest', category: 'test_framework', confidence: 'high', detectedFrom: 'pytest.ini' },
  '.eslintrc.json': { name: 'ESLint', category: 'linter', confidence: 'high', detectedFrom: '.eslintrc.json' },
  'eslint.config.js': { name: 'ESLint', category: 'linter', confidence: 'high', detectedFrom: 'eslint.config.js' },
  '.github/workflows': { name: 'GitHub Actions', category: 'ci', confidence: 'high', detectedFrom: '.github/workflows/' },
  'pnpm-workspace.yaml': { name: 'pnpm', category: 'package_manager', confidence: 'high', detectedFrom: 'pnpm-workspace.yaml' },
  'yarn.lock': { name: 'Yarn', category: 'package_manager', confidence: 'high', detectedFrom: 'yarn.lock' },
  'pnpm-lock.yaml': { name: 'pnpm', category: 'package_manager', confidence: 'high', detectedFrom: 'pnpm-lock.yaml' },
};

/**
 * Zero-Config Onboarding Service
 * Provides automated tech stack detection, config generation,
 * and guided installation wizard flow.
 */
export class ZeroConfigOnboardingService {
  private sessions = new Map<string, OnboardingSession>();

  /**
   * Start a new onboarding session
   */
  async startOnboarding(params: {
    userLogin: string;
    owner: string;
    repo: string;
  }): Promise<OnboardingSession> {
    const session: OnboardingSession = {
      id: uuidv4(),
      userLogin: params.userLogin,
      currentStep: 'app_install',
      completedSteps: [],
      repository: { owner: params.owner, name: params.repo },
      startedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    logger.info({ sessionId: session.id, owner: params.owner, repo: params.repo }, 'Onboarding session started');
    return session;
  }

  /**
   * Detect tech stack from repository files
   */
  async detectTechStack(params: {
    owner: string;
    repo: string;
    repoFiles: string[];
  }): Promise<TechStackResult> {
    const startTime = Date.now();
    const { owner, repo, repoFiles } = params;

    logger.info({ owner, repo, fileCount: repoFiles.length }, 'Detecting tech stack');

    const languages: DetectedTechnology[] = [];
    const frameworks: DetectedTechnology[] = [];
    let testFramework: DetectedTechnology | null = null;
    let linter: DetectedTechnology | null = null;
    let ci: DetectedTechnology | null = null;
    let packageManager: DetectedTechnology | null = null;

    for (const file of repoFiles) {
      const basename = file.split('/').pop() || file;
      const tech = FILE_TO_TECH[basename] || FILE_TO_TECH[file];
      if (!tech) continue;

      const detected = { ...tech, configFile: file };
      switch (tech.category) {
        case 'language': languages.push(detected); break;
        case 'framework': frameworks.push(detected); break;
        case 'test_framework': if (!testFramework) testFramework = detected; break;
        case 'linter': if (!linter) linter = detected; break;
        case 'ci': if (!ci) ci = detected; break;
        case 'package_manager': if (!packageManager) packageManager = detected; break;
      }
    }

    // Detect project type
    const isMonorepo = repoFiles.some(f =>
      f === 'pnpm-workspace.yaml' || f === 'lerna.json' || f === 'nx.json' || f === 'turbo.json'
    );
    const projectType = isMonorepo ? 'monorepo' as const : 'single_package' as const;

    const result: TechStackResult = {
      id: uuidv4(),
      repository: { owner, name: repo },
      languages,
      frameworks,
      testFramework,
      linter,
      ci,
      packageManager,
      projectType,
      structureHints: {
        hasSourceDir: repoFiles.some(f => f.startsWith('src/')),
        hasTestDir: repoFiles.some(f => f.startsWith('test/') || f.startsWith('__tests__/')),
        hasDocsDir: repoFiles.some(f => f.startsWith('docs/')),
        hasCIConfig: repoFiles.some(f => f.startsWith('.github/') || f === '.travis.yml' || f === 'Jenkinsfile'),
        hasDockerfile: repoFiles.some(f => f === 'Dockerfile' || f === 'docker-compose.yml'),
      },
      detectedAt: new Date(),
      detectionDurationMs: Date.now() - startTime,
    };

    logger.info({ owner, repo, languages: languages.length, frameworks: frameworks.length, testFramework: testFramework?.name }, 'Tech stack detection completed');
    return result;
  }

  /**
   * Generate configuration from detected tech stack
   */
  async generateConfig(params: {
    owner: string;
    repo: string;
    techStack: TechStackResult;
    templateId?: string;
  }): Promise<GeneratedConfig> {
    const { owner, repo, techStack } = params;

    logger.info({ owner, repo }, 'Generating configuration');

    const sections: GeneratedConfig['sections'] = [];
    const configLines: string[] = ['# PRFlow Configuration', `# Auto-generated for ${owner}/${repo}`, ''];

    // Review settings
    configLines.push('review:');
    configLines.push('  enabled: true');
    configLines.push(`  severity_threshold: medium`);
    configLines.push('  auto_fix_style: true');
    sections.push({ key: 'review', label: 'Review Settings', description: 'Controls automated review behavior', source: 'template_default', editable: true });

    // Test generation
    configLines.push('');
    configLines.push('test_generation:');
    configLines.push('  enabled: true');
    if (techStack.testFramework) {
      configLines.push(`  framework: ${techStack.testFramework.name.toLowerCase()}`);
      sections.push({ key: 'test_generation', label: 'Test Generation', description: `Auto-detected ${techStack.testFramework.name} test framework`, source: 'auto_detected', editable: true });
    } else {
      configLines.push('  framework: auto');
      sections.push({ key: 'test_generation', label: 'Test Generation', description: 'Test framework will be auto-detected per PR', source: 'template_default', editable: true });
    }

    // Documentation
    configLines.push('');
    configLines.push('documentation:');
    configLines.push('  enabled: true');
    configLines.push('  update_readme: true');
    configLines.push('  update_changelog: true');
    sections.push({ key: 'documentation', label: 'Documentation', description: 'Auto-update docs on PR analysis', source: 'template_default', editable: true });

    // Language-specific settings
    if (techStack.languages.length > 0) {
      configLines.push('');
      configLines.push('languages:');
      for (const lang of techStack.languages) {
        configLines.push(`  - ${lang.name.toLowerCase()}`);
      }
      sections.push({ key: 'languages', label: 'Languages', description: `Detected: ${techStack.languages.map(l => l.name).join(', ')}`, source: 'auto_detected', editable: false });
    }

    // Merge settings
    configLines.push('');
    configLines.push('merge:');
    configLines.push('  queue_enabled: false');
    configLines.push('  method: squash');
    configLines.push('  block_on_critical: true');
    sections.push({ key: 'merge', label: 'Merge Settings', description: 'Controls merge queue and merge method', source: 'template_default', editable: true });

    return {
      id: uuidv4(),
      repository: { owner, name: repo },
      yamlContent: configLines.join('\n'),
      sections,
      templateId: params.templateId,
      generatedAt: new Date(),
    };
  }

  /**
   * Get onboarding session
   */
  async getSession(sessionId: string): Promise<OnboardingSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Advance onboarding step
   */
  async advanceStep(sessionId: string, completedStep: string): Promise<OnboardingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    if (!session.completedSteps.includes(completedStep)) {
      session.completedSteps.push(completedStep);
    }

    const steps = ['app_install', 'repo_scan', 'config_review', 'first_analysis', 'completed'];
    const currentIdx = steps.indexOf(completedStep);
    if (currentIdx >= 0 && currentIdx < steps.length - 1) {
      session.currentStep = steps[currentIdx + 1];
    }

    if (session.currentStep === 'completed') {
      session.completedAt = new Date();
    }

    return session;
  }

  /**
   * Get onboarding metrics
   */
  async getOnboardingMetrics(): Promise<{
    totalStarts: number;
    totalCompletions: number;
    completionRate: number;
    avgDurationMs: number;
  }> {
    const sessions = Array.from(this.sessions.values());
    const completed = sessions.filter(s => s.completedAt);

    return {
      totalStarts: sessions.length,
      totalCompletions: completed.length,
      completionRate: sessions.length > 0 ? completed.length / sessions.length : 0,
      avgDurationMs: completed.length > 0
        ? completed.reduce((sum, s) => sum + (s.completedAt!.getTime() - s.startedAt.getTime()), 0) / completed.length
        : 0,
    };
  }
}

export const zeroConfigOnboardingService = new ZeroConfigOnboardingService();
