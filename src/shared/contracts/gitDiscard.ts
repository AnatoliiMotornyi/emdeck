export interface DiscardFile {
  path: string;
  effect: 'restore' | 'remove';
}

export interface DiscardRequest {
  paths: string[];
  revision: string;
}

export interface DiscardPlan extends DiscardRequest {
  files: DiscardFile[];
}
