import eventBus from '../../utils/broadcast-channel-pubsub'
import createHttpStore from './http-store';
import createApiPlayerWithScoresProvider from './providers/api-player-with-scores'
import {opt} from '../../utils/js'
import createPlayerService from '../../services/scoresaber/player'
import {addToDate, MINUTE} from '../../utils/date'

export default (playerId = null, scoresType = 'recent', scoresPage = 1, initialState = null) => {
  let currentPlayerId = playerId;
  let currentScoresType = scoresType;
  let currentScoresPage = scoresPage;

  let playerService = createPlayerService();

  const onNewData = ({fetchParams}) => {
    currentPlayerId = opt(fetchParams, 'playerId', null);
    currentScoresType = opt(fetchParams, 'scoresType', null);
    currentScoresPage = opt(fetchParams, 'scoresPage', null);
  }

  const provider = createApiPlayerWithScoresProvider();

  const httpStore = createHttpStore(
    provider,
    playerId ? {playerId, scoresType, scoresPage} : null,
    initialState,
    {
      onInitialized: onNewData,
      onAfterStateChange: onNewData,
    },
  );

  const fetch = async (playerId = currentPlayerId, scoresType = currentScoresType, scoresPage = currentScoresPage, force = false) => {
    if (
      (!playerId || playerId === currentPlayerId) &&
      (!scoresType || scoresType === currentScoresType) &&
      (!scoresPage || scoresPage === currentScoresPage) &&
      !force
    )
      return false;

    return httpStore.fetch({playerId, scoresType, scoresPage}, force, provider);
  }

  const refresh = async () => fetch(currentPlayerId, currentScoresType, currentScoresPage, true);

  let lastRecentPlay = null;
  const playerRecentPlayUpdatedUnsubscribe = eventBus.on('player-recent-play-updated', async ({playerId, recentPlay}) => {
    if (!playerId || !currentPlayerId || playerId !== currentPlayerId) return;

    if (!recentPlay || !lastRecentPlay || recentPlay <= lastRecentPlay) {
      if (recentPlay) lastRecentPlay = recentPlay;
      return;
    }

    lastRecentPlay = recentPlay;

    await refresh();
  });

  const subscribe = fn => {
    const storeUnsubscribe = httpStore.subscribe(fn);

    return () => {
      storeUnsubscribe();
      playerRecentPlayUpdatedUnsubscribe();
    }
  }

  const DEFAULT_RECENT_PLAY_REFRESH_INTERVAL = MINUTE;

  const enqueueRecentPlayRefresh = async () => {
    if (!currentPlayerId) {
      setTimeout(() => enqueueRecentPlayRefresh(), DEFAULT_RECENT_PLAY_REFRESH_INTERVAL);

      return;
    }

    await playerService.fetchPlayerAndUpdateRecentPlay(currentPlayerId);

    const refreshInterval = !lastRecentPlay || lastRecentPlay >= addToDate(-30 * MINUTE, new Date())
      ? DEFAULT_RECENT_PLAY_REFRESH_INTERVAL
      : 15 * MINUTE;

    setTimeout(() => enqueueRecentPlayRefresh(), refreshInterval);

  }

  setTimeout(() => enqueueRecentPlayRefresh(), DEFAULT_RECENT_PLAY_REFRESH_INTERVAL);

  return {
    ...httpStore,
    subscribe,
    fetch,
    refresh,
    getPlayerId: () => currentPlayerId,
    getType: () => currentScoresType,
    setType: type => currentScoresType = type,
    getPage: () => currentScoresPage,
    setPage: page => currentScoresPage = page,
  }
}

