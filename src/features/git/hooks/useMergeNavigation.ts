import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { createMergeReview } from '../services/mergeReview';

export const useMergeNavigation = (
  path: string,
  review: ReturnType<typeof createMergeReview>,
  busy: boolean
) => {
  const [navigation, setNavigation] = useState({
    index: 0,
    sequence: 0,
    all: false,
    path: path,
    position: undefined as (typeof review.locations)[number] | undefined,
  });
  const locations = navigation.all ? review.locations : review.conflictLocations;
  const index = Math.min(
    navigation.path === path ? navigation.index : 0,
    Math.max(0, locations.length - 1)
  );
  const location = locations[index];
  const selectedBlock = location?.conflict ?? -1;
  const reveal = useMemo(
    () =>
      navigation.position && navigation.path === path
        ? {
            ours: { position: navigation.position.ours, sequence: navigation.sequence },
            result: { position: navigation.position.result, sequence: navigation.sequence },
            theirs: { position: navigation.position.theirs, sequence: navigation.sequence },
          }
        : undefined,
    [navigation.position, navigation.path, navigation.sequence, path]
  );
  const handlePrevious = () =>
    setNavigation(value => ({
      ...value,
      index: (index - 1 + locations.length) % locations.length,
      position: locations[(index - 1 + locations.length) % locations.length],
      path: path,
      sequence: value.sequence + 1,
    }));
  const handleNext = () =>
    setNavigation(value => ({
      ...value,
      index: (index + 1) % locations.length,
      position: locations[(index + 1) % locations.length],
      path: path,
      sequence: value.sequence + 1,
    }));
  const handleScope = () =>
    setNavigation(value => ({
      index: 0,
      all: !value.all,
      sequence: value.sequence + 1,
      path: path,
      position: (value.all ? review.conflictLocations : review.locations)[0],
    }));
  const handleNavigationKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'F7' || !locations.length || busy) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) handlePrevious();
    else handleNext();
  };
  return {
    navigation,
    locations,
    index,
    selectedBlock,
    reveal,
    handlePrevious,
    handleNext,
    handleScope,
    handleNavigationKey,
  };
};
