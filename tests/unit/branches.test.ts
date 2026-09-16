import { describe, expect, it } from 'vitest';
import { branchTree } from '../../src/features/git/services/branchTree';

describe('branch folder hierarchy', () => {
  it('shares folders and preserves full names for duplicate leaf labels', () => {
    const tree = branchTree([
      'main',
      'dima/bugfix/branch-name',
      'dima/bugfix/another',
      'dima/feature/branch-name',
    ]);
    expect(tree.map(node => node.name)).toEqual(['main', 'dima']);
    expect(tree[1].children.map(node => node.name)).toEqual(['bugfix', 'feature']);
    expect(tree[1].children[0].children).toEqual([
      { name: 'another', path: 'dima/bugfix/another', children: [] },
      { name: 'branch-name', path: 'dima/bugfix/branch-name', children: [] },
    ]);
    expect(tree[1].children[1].children[0].path).toBe('dima/feature/branch-name');
  });

  it('keeps local main before folders and branches without promoting nested names', () => {
    const branches = ['dev', 'main', 'feature/main', 'feature/aaa', 'aaa', 'topic10', 'topic2'];
    const tree = branchTree(branches);
    expect(tree.map(node => node.name)).toEqual([
      'main',
      'feature',
      'aaa',
      'dev',
      'topic2',
      'topic10',
    ]);
    expect(tree[1].children.map(node => node.name)).toEqual(['aaa', 'main']);
    expect(branchTree(branches, 'main').map(node => node.name)).toEqual(['main', 'feature']);
    expect(branchTree(branches, 'feature').map(node => node.name)).toEqual(['feature']);
    expect(branches[0]).toBe('dev');
  });

  it('keeps main first within each remote while preserving remote and folder order', () => {
    const tree = branchTree(
      [
        'upstream/dev',
        'upstream/main',
        'origin/feature/main',
        'origin/feature/aaa',
        'origin/dev',
        'origin/main',
      ],
      '',
      'remote'
    );
    expect(tree.map(node => node.name)).toEqual(['origin', 'upstream']);
    expect(tree[0].children.map(node => node.name)).toEqual(['main', 'feature', 'dev']);
    expect(tree[1].children.map(node => node.name)).toEqual(['main', 'dev']);
    expect(tree[0].children[1].children.map(node => node.name)).toEqual(['aaa', 'main']);
    expect(
      branchTree(['origin/aaa', 'origin/dev'], '', 'remote')[0].children.map(node => node.name)
    ).toEqual(['aaa', 'dev']);
  });

  it('filters full paths without losing remote names or parent folders', () => {
    const tree = branchTree(
      ['origin/dima/bugfix/branch-name', 'upstream/main', 'origin/main'],
      ' DIMA/BUGFIX ',
      'remote'
    );
    expect(tree).toEqual([
      {
        name: 'origin',
        path: 'origin',
        children: [
          {
            name: 'dima',
            path: 'origin/dima',
            children: [
              {
                name: 'bugfix',
                path: 'origin/dima/bugfix',
                children: [
                  { name: 'branch-name', path: 'origin/dima/bugfix/branch-name', children: [] },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(branchTree(['main'], 'missing')).toEqual([]);
    expect(branchTree([])).toEqual([]);
  });
});
