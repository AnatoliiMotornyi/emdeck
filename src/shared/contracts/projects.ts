import type { Project } from './workspace';

export type OpenTarget = 'auto' | 'new' | 'current';
export type OpenProjectResult =
  { kind: 'opened'; project: Project } | { kind: 'focused'; window: string };
export interface OpenWindowResult {
  label: string;
  reused: boolean;
}
