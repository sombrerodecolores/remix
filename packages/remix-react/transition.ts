import { Action } from "history";
import type { Location } from "history";

import type { RouteData } from "./routeData";
import type { RouteMatch } from "./routeMatching";
import type { ClientRoute } from "./routes";
import { matchClientRoutes } from "./routeMatching";
import invariant from "./invariant";

export interface CatchData<T = any> {
  status: number;
  statusText: string;
  data: T;
}

export interface TransitionManagerState {
  /**
   * The current location the user sees in the browser, during a transition this
   * is the "old page"
   */
  location: Location;

  /**
   * The current set of route matches the user sees in the browser. During a
   * transition this are the "old matches"
   */
  matches: ClientMatch[];

  /**
   * Only used When both navigation and fetch loads are pending, the fetch loads
   * may need to use the next matches to load data.
   */
  nextMatches?: ClientMatch[];

  /**
   * Data from the loaders that user sees in the browser. During a transition
   * this is the "old" data, unless there are multiple pending forms, in which
   * case this may be updated as fresh data loads complete
   */
  loaderData: RouteData;

  /**
   * Holds the action data for the latest NormalPostSubmission
   */
  actionData?: RouteData;

  /**
   * Tracks the latest, non-keyed pending submission
   */
  transition: Transition;

  /**
   * Persists thrown response loader/action data. TODO: should probably be an array
   * and keep track of them all and pass the array to ErrorBoundary.
   */
  catch?: CatchData;

  /**
   * Persists uncaught loader/action errors. TODO: should probably be an array
   * and keep track of them all and pass the array to ErrorBoundary.
   */
  error?: Error;

  /**
   * The id of the nested ErrorBoundary in which to render the error.
   *
   * - undefined: no error
   * - null: error, but no routes have a boundary, use a default
   * - string: actual id
   */
  errorBoundaryId: null | string;

  /**
   * The id of the nested ErrorBoundary in which to render the error.
   *
   * - undefined: no error
   * - null: error, but no routes have a boundary, use a default
   * - string: actual id
   */
  catchBoundaryId: null | string;

  fetchers: Map<string, Fetcher>;
}

export interface TransitionManagerInit {
  routes: ClientRoute[];
  location: Location;
  loaderData: RouteData;
  actionData?: RouteData;
  catch?: CatchData;
  error?: Error;
  catchBoundaryId?: null | string;
  errorBoundaryId?: null | string;
  onChange: (state: TransitionManagerState) => void;
  onRedirect: (to: string, state?: any) => void;
}

export interface Submission {
  action: string;
  method: string;
  formData: FormData;
  encType: string;
  key: string;
}

export interface ActionSubmission extends Submission {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
}

export interface LoaderSubmission extends Submission {
  method: "GET";
}

export type TransitionStates = {
  Idle: {
    state: "idle";
    type: "idle";
    submission: undefined;
    location: undefined;
  };
  SubmittingAction: {
    state: "submitting";
    type: "actionSubmission";
    submission: ActionSubmission;
    location: Location;
  };
  SubmittingLoader: {
    state: "submitting";
    type: "loaderSubmission";
    submission: LoaderSubmission;
    location: Location;
  };
  LoadingLoaderSubmissionRedirect: {
    state: "loading";
    type: "loaderSubmissionRedirect";
    submission: LoaderSubmission;
    location: Location;
  };
  LoadingAction: {
    state: "loading";
    type: "actionReload";
    submission: ActionSubmission;
    location: Location;
  };
  LoadingActionRedirect: {
    state: "loading";
    type: "actionRedirect";
    submission: ActionSubmission;
    location: Location;
  };
  LoadingFetchActionRedirect: {
    state: "loading";
    type: "fetchActionRedirect";
    submission: undefined;
    location: Location;
  };
  LoadingRedirect: {
    state: "loading";
    type: "normalRedirect";
    submission: undefined;
    location: Location;
  };
  Loading: {
    state: "loading";
    type: "normalLoad";
    location: Location;
    submission: undefined;
  };
};

export type Transition = TransitionStates[keyof TransitionStates];

export type Redirects = {
  Loader: {
    isRedirect: true;
    type: "loader";
  };
  Action: {
    isRedirect: true;
    type: "action";
  };
  LoaderSubmission: {
    isRedirect: true;
    type: "loaderSubmission";
  };
  FetchAction: {
    isRedirect: true;
    type: "fetchAction";
  };
};

// TODO: keep data around on resubmission?
type FetcherStates<TData = any> = {
  Idle: {
    state: "idle";
    type: "init";
    submission: undefined;
    data: undefined;
  };
  SubmittingAction: {
    state: "submitting";
    type: "actionSubmission";
    submission: ActionSubmission;
    data: undefined;
  };
  SubmittingLoader: {
    state: "submitting";
    type: "loaderSubmission";
    submission: LoaderSubmission;
    data: TData | undefined;
  };
  ReloadingAction: {
    state: "loading";
    type: "actionReload";
    submission: ActionSubmission;
    data: TData;
  };
  Loading: {
    state: "loading";
    type: "normalLoad";
    submission: undefined;
    data: TData | undefined;
  };
  Done: {
    state: "idle";
    type: "done";
    submission: undefined;
    data: TData;
  };
};

export type Fetcher<TData = any> =
  FetcherStates<TData>[keyof FetcherStates<TData>];

type ClientMatch = RouteMatch<ClientRoute>;

type DataResult = {
  match: ClientMatch;
  value: TransitionRedirect | Error | any;
};

type DataRedirectResult = {
  match: ClientMatch;
  value: TransitionRedirect;
};

type DataErrorResult = {
  match: ClientMatch;
  value: Error;
};

type DataCatchResult = {
  match: ClientMatch;
  value: CatchValue;
};

export class CatchValue {
  constructor(
    public status: number,
    public statusText: string,
    public data: any
  ) {}
}

export type NavigationEvent = {
  type: "navigation";
  action: Action;
  location: Location;
  submission?: Submission;
};

export type FetcherEvent = {
  type: "fetcher";
  key: string;
  submission?: Submission;
  href: string;
};

export type DataEvent = NavigationEvent | FetcherEvent;

////////////////////////////////////////////////////////////////////////////////
function isActionSubmission(
  submission: Submission
): submission is ActionSubmission {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(submission.method);
}

function isLoaderSubmission(
  submission: Submission
): submission is LoaderSubmission {
  return submission.method === "GET";
}

interface _Location extends Location {
  state: {
    isRedirect: boolean;
    type: string;
  } | null;
}

interface RedirectLocation extends _Location {
  state: {
    isRedirect: true;
    type: string;
  };
}

function isRedirectLocation(location: Location): location is RedirectLocation {
  return (
    Boolean(location.state) && (location as RedirectLocation).state.isRedirect
  );
}

interface LoaderRedirectLocation extends RedirectLocation {
  state: {
    isRedirect: true;
    type: "loader";
  };
}

function isLoaderRedirectLocation(
  location: Location
): location is LoaderRedirectLocation {
  return isRedirectLocation(location) && location.state.type === "loader";
}

interface ActionRedirectLocation extends RedirectLocation {
  state: {
    isRedirect: true;
    type: "action";
  };
}

function isActionRedirectLocation(
  location: Location
): location is ActionRedirectLocation {
  return isRedirectLocation(location) && location.state.type === "action";
}

interface FetchActionRedirectLocation extends RedirectLocation {
  state: {
    isRedirect: true;
    type: "fetchAction";
  };
}

function isFetchActionRedirect(
  location: Location
): location is FetchActionRedirectLocation {
  return isRedirectLocation(location) && location.state.type === "fetchAction";
}

interface LoaderSubmissionRedirectLocation extends RedirectLocation {
  state: {
    isRedirect: true;
    type: "loaderSubmission";
  };
}

function isLoaderSubmissionRedirectLocation(
  location: Location
): location is LoaderSubmissionRedirectLocation {
  return (
    isRedirectLocation(location) && location.state.type === "loaderSubmission"
  );
}

export class TransitionRedirect {
  location: string;
  constructor(location: Location | string) {
    this.location =
      typeof location === "string"
        ? location
        : location.pathname + location.search;
  }
}

export const IDLE_TRANSITION: TransitionStates["Idle"] = {
  state: "idle",
  submission: undefined,
  location: undefined,
  type: "idle"
};

export const IDLE_FETCHER: FetcherStates["Idle"] = {
  state: "idle",
  type: "init",
  data: undefined,
  submission: undefined
};

export function createTransitionManager(init: TransitionManagerInit) {
  let { routes } = init;

  let pendingNavigationController: AbortController | undefined;
  let fetchControllers = new Map<string, AbortController>();
  let incrementingLoadId = 0;
  let navigationLoadId = -1;
  let fetchReloadIds = new Map<string, number>();

  let matches = matchClientRoutes(routes, init.location);

  if (!matches) {
    // If we do not match a user-provided-route, fall back to the root
    // to allow the CatchBoundary to take over
    matches = [
      {
        params: {},
        pathname: "",
        route: routes[0]
      }
    ];
  }

  let state: TransitionManagerState = {
    location: init.location,
    loaderData: init.loaderData || {},
    actionData: init.actionData,
    catch: init.catch,
    error: init.error,
    catchBoundaryId: init.catchBoundaryId || null,
    errorBoundaryId: init.errorBoundaryId || null,
    matches,
    nextMatches: undefined,
    transition: IDLE_TRANSITION,
    fetchers: new Map()
  };

  function update(updates: Partial<TransitionManagerState>) {
    state = Object.assign({}, state, updates);
    init.onChange(state);
  }

  function getState(): TransitionManagerState {
    return state;
  }

  function getFetcher<TData = any>(key: string): Fetcher<TData> {
    return state.fetchers.get(key) || IDLE_FETCHER;
  }

  function deleteFetcher(key: string): void {
    if (fetchControllers.has(key)) abortFetcher(key);
    fetchReloadIds.delete(key);
    state.fetchers.delete(key);
  }

  async function send(event: DataEvent): Promise<void> {
    switch (event.type) {
      case "navigation": {
        let { action, location, submission } = event;

        let matches = matchClientRoutes(routes, location);

        if (!matches) {
          matches = [
            {
              params: {},
              pathname: "",
              route: routes[0]
            }
          ];
          await handleNotFoundNavigation(location, matches);
        } else if (!submission && isHashChangeOnly(location)) {
          await handleHashChange(location, matches);
        }
        // back/forward button, treat all as normal navigation
        else if (action === Action.Pop) {
          await handleLoad(location, matches);
        }
        // <Form method="post | put | delete | patch">
        else if (submission && isActionSubmission(submission)) {
          await handleActionSubmissionNavigation(location, submission, matches);
        }
        // <Form method="get"/>
        else if (submission && isLoaderSubmission(submission)) {
          await handleLoaderSubmissionNavigation(location, submission, matches);
        }
        // action=>redirect
        else if (isActionRedirectLocation(location)) {
          await handleActionRedirect(location, matches);
        }
        // <Form method="get"> --> loader=>redirect
        else if (isLoaderSubmissionRedirectLocation(location)) {
          await handleLoaderSubmissionRedirect(location, matches);
        }
        // loader=>redirect
        else if (isLoaderRedirectLocation(location)) {
          await handleLoaderRedirect(location, matches);
        }
        // useSubmission()=>redirect
        else if (isFetchActionRedirect(location)) {
          await handleFetchActionRedirect(location, matches);
        }
        // <Link>, navigate()
        else {
          await handleLoad(location, matches);
        }

        navigationLoadId = -1;
        break;
      }

      case "fetcher": {
        let { key, submission, href } = event;

        let matches = matchClientRoutes(routes, href);
        invariant(matches, "No matches found");
        let match = matches.slice(-1)[0];

        if (fetchControllers.has(key)) abortFetcher(key);

        if (submission && isActionSubmission(submission)) {
          await handleActionFetchSubmission(key, submission, match);
        } else if (submission && isLoaderSubmission(submission)) {
          await handleLoaderFetchSubmission(href, key, submission, match);
        } else {
          await handleLoaderFetch(href, key, match);
        }

        break;
      }

      default: {
        // @ts-ignore
        throw new Error(`Unknown data event type: ${event.type}`);
      }
    }
  }

  function dispose() {
    abortNormalNavigation();
    for (let [, controller] of fetchControllers) {
      controller.abort();
    }
  }

  async function handleActionFetchSubmission(
    key: string,
    submission: ActionSubmission,
    match: ClientMatch
  ) {
    let currentFetcher = state.fetchers.get(key);

    let fetcher: FetcherStates["SubmittingAction"] = {
      state: "submitting",
      type: "actionSubmission",
      submission,
      data: currentFetcher?.data || undefined
    };
    state.fetchers.set(key, fetcher);

    update({ fetchers: new Map(state.fetchers) });

    let controller = new AbortController();
    fetchControllers.set(key, controller);

    let result = await callAction(submission, match, controller.signal);
    if (controller.signal.aborted) {
      return;
    }

    if (isRedirectResult(result)) {
      let locationState: Redirects["FetchAction"] = {
        isRedirect: true,
        type: "fetchAction"
      };
      init.onRedirect(result.value.location, locationState);
      return;
    }

    if (maybeBailOnError(match, key, result)) {
      return;
    }

    if (await maybeBailOnCatch(match, key, result)) {
      return;
    }

    let loadFetcher: FetcherStates["ReloadingAction"] = {
      state: "loading",
      type: "actionReload",
      data: result.value,
      submission
    };
    state.fetchers.set(key, loadFetcher);

    update({ fetchers: new Map(state.fetchers) });

    let maybeActionErrorResult = isErrorResult(result) ? result : undefined;
    let maybeActionCatchResult = isCatchResult(result) ? result : undefined;

    let loadId = ++incrementingLoadId;
    fetchReloadIds.set(key, loadId);

    let matchesToLoad = state.nextMatches || state.matches;
    let hrefToLoad = createHref(state.transition.location || state.location);

    let results = await callLoaders(
      state,
      createUrl(hrefToLoad),
      matchesToLoad,
      controller.signal,
      maybeActionErrorResult,
      maybeActionCatchResult,
      submission,
      match.route.id,
      loadFetcher
    );

    if (controller.signal.aborted) {
      return;
    }

    fetchReloadIds.delete(key);
    fetchControllers.delete(key);

    let redirect = findRedirect(results);
    if (redirect) {
      let locationState: Redirects["Loader"] = {
        isRedirect: true,
        type: "loader"
      };
      init.onRedirect(redirect.location, locationState);
      return;
    }

    let [error, errorBoundaryId] = findErrorAndBoundaryId(
      results,
      state.matches,
      maybeActionErrorResult
    );

    let [catchVal, catchBoundaryId] = await findCatchAndBoundaryId(
      results,
      state.matches,
      maybeActionCatchResult
    );

    let doneFetcher: FetcherStates["Done"] = {
      state: "idle",
      type: "done",
      data: result.value,
      submission: undefined
    };
    state.fetchers.set(key, doneFetcher);

    let abortedKeys = abortStaleFetchLoads(loadId);
    if (abortedKeys) {
      markFetchersDone(abortedKeys);
    }

    let yeetedNavigation = yeetStaleNavigationLoad(loadId);

    // need to do what we would have done when the navigation load completed
    if (yeetedNavigation) {
      let { transition } = state;
      invariant(transition.state === "loading", "Expected loading transition");

      update({
        location: transition.location,
        matches: state.nextMatches,
        error,
        errorBoundaryId,
        catch: catchVal,
        catchBoundaryId,
        loaderData: makeLoaderData(state, results, matchesToLoad),
        actionData:
          transition.type === "actionReload" ? state.actionData : undefined,
        transition: IDLE_TRANSITION,
        fetchers: new Map(state.fetchers)
      });
    }

    // otherwise just update the info for the data
    else {
      update({
        fetchers: new Map(state.fetchers),
        error,
        errorBoundaryId,
        loaderData: makeLoaderData(state, results, matchesToLoad)
      });
    }
  }

  function yeetStaleNavigationLoad(landedId: number): boolean {
    let isLoadingNavigation = state.transition.state === "loading";
    if (isLoadingNavigation && navigationLoadId < landedId) {
      abortNormalNavigation();
      return true;
    }
    return false;
  }

  function markFetchersDone(keys: string[]) {
    for (let key of keys) {
      let fetcher = getFetcher(key);
      let doneFetcher: FetcherStates["Done"] = {
        state: "idle",
        type: "done",
        data: fetcher.data,
        submission: undefined
      };
      state.fetchers.set(key, doneFetcher);
    }
  }

  function abortStaleFetchLoads(landedId: number): false | string[] {
    let yeetedKeys = [];
    for (let [key, id] of fetchReloadIds) {
      if (id < landedId) {
        let fetcher = state.fetchers.get(key);
        invariant(fetcher, `Expected fetcher: ${key}`);
        if (fetcher.state === "loading") {
          abortFetcher(key);
          fetchReloadIds.delete(key);
          yeetedKeys.push(key);
        }
      }
    }
    return yeetedKeys.length ? yeetedKeys : false;
  }

  async function handleLoaderFetchSubmission(
    href: string,
    key: string,
    submission: LoaderSubmission,
    match: ClientMatch
  ) {
    let currentFetcher = state.fetchers.get(key);
    let fetcher: FetcherStates["SubmittingLoader"] = {
      state: "submitting",
      type: "loaderSubmission",
      submission,
      data: currentFetcher?.data || undefined
    };

    state.fetchers.set(key, fetcher);
    update({ fetchers: new Map(state.fetchers) });

    let controller = new AbortController();
    fetchControllers.set(key, controller);
    let result = await callLoader(match, createUrl(href), controller.signal);
    fetchControllers.delete(key);

    if (controller.signal.aborted) {
      return;
    }

    if (isRedirectResult(result)) {
      let locationState: Redirects["Loader"] = {
        isRedirect: true,
        type: "loader"
      };
      init.onRedirect(result.value.location, locationState);
      return;
    }

    if (maybeBailOnError(match, key, result)) {
      return;
    }

    if (await maybeBailOnCatch(match, key, result)) {
      return;
    }

    let doneFetcher: FetcherStates["Done"] = {
      state: "idle",
      type: "done",
      data: result.value,
      submission: undefined
    };
    state.fetchers.set(key, doneFetcher);

    update({ fetchers: new Map(state.fetchers) });
  }

  async function handleLoaderFetch(
    href: string,
    key: string,
    match: ClientMatch
  ) {
    let currentFetcher = state.fetchers.get(key);

    let fetcher: FetcherStates["Loading"] = {
      state: "loading",
      type: "normalLoad",
      submission: undefined,
      data: currentFetcher?.data || undefined
    };

    state.fetchers.set(key, fetcher);
    update({ fetchers: new Map(state.fetchers) });

    let controller = new AbortController();
    fetchControllers.set(key, controller);
    let result = await callLoader(match, createUrl(href), controller.signal);

    if (controller.signal.aborted) return;
    fetchControllers.delete(key);

    if (isRedirectResult(result)) {
      let locationState: Redirects["Loader"] = {
        isRedirect: true,
        type: "loader"
      };
      init.onRedirect(result.value.location, locationState);
      return;
    }

    if (maybeBailOnError(match, key, result)) {
      return;
    }

    if (await maybeBailOnCatch(match, key, result)) {
      return;
    }

    let doneFetcher: FetcherStates["Done"] = {
      state: "idle",
      type: "done",
      data: result.value,
      submission: undefined
    };
    state.fetchers.set(key, doneFetcher);

    update({ fetchers: new Map(state.fetchers) });
  }

  async function maybeBailOnCatch(
    match: ClientMatch,
    key: string,
    result: DataResult
  ) {
    if (isCatchResult(result)) {
      let catchBoundaryId = findNearestCatchBoundary(match, state.matches);
      state.fetchers.delete(key);
      update({
        transition: IDLE_TRANSITION,
        fetchers: new Map(state.fetchers),
        catch: {
          data: result.value.data,
          status: result.value.status,
          statusText: result.value.statusText
        },
        catchBoundaryId
      });
      return true;
    }
    return false;
  }

  function maybeBailOnError(
    match: ClientMatch,
    key: string,
    result: DataResult
  ) {
    if (isErrorResult(result)) {
      let errorBoundaryId = findNearestBoundary(match, state.matches);
      state.fetchers.delete(key);
      update({
        fetchers: new Map(state.fetchers),
        error: result.value,
        errorBoundaryId
      });
      return true;
    }
    return false;
  }

  async function handleNotFoundNavigation(
    location: Location,
    matches: RouteMatch<ClientRoute>[]
  ) {
    abortNormalNavigation();
    let transition: TransitionStates["Loading"] = {
      state: "loading",
      type: "normalLoad",
      submission: undefined,
      location
    };
    update({ transition, nextMatches: matches });

    // Force async so UI code doesn't have to special not found route changes not
    // skipping the pending state (like scroll restoration gets really
    // complicated without the pending state, maybe we can figure something else
    // out later, but this works great.)
    await Promise.resolve();

    let catchBoundaryId = findNearestCatchBoundary(matches[0], matches);
    update({
      location,
      matches,
      catch: {
        data: null,
        status: 404,
        statusText: "Not Found"
      },
      catchBoundaryId,
      transition: IDLE_TRANSITION
    });
  }

  async function handleActionSubmissionNavigation(
    location: Location,
    submission: ActionSubmission,
    matches: ClientMatch[]
  ) {
    abortNormalNavigation();

    let transition: TransitionStates["SubmittingAction"] = {
      state: "submitting",
      type: "actionSubmission",
      submission,
      location
    };

    update({ transition, nextMatches: matches });

    let controller = new AbortController();
    pendingNavigationController = controller;

    if (
      !isIndexRequestAction(submission.action) &&
      matches[matches.length - 1].route.id.endsWith("/index")
    ) {
      matches = matches.slice(0, -1);
    }

    let leafMatch = matches.slice(-1)[0];
    let result = await callAction(submission, leafMatch, controller.signal);

    if (controller.signal.aborted) {
      return;
    }

    if (isRedirectResult(result)) {
      let locationState: Redirects["Action"] = {
        isRedirect: true,
        type: "action"
      };
      init.onRedirect(result.value.location, locationState);
      return;
    }

    if (isCatchResult(result)) {
      let [catchVal, catchBoundaryId] = await findCatchAndBoundaryId(
        [result],
        matches,
        result
      );
      update({
        transition: IDLE_TRANSITION,
        catch: catchVal,
        catchBoundaryId
      });
      return;
    }

    let loadTransition: TransitionStates["LoadingAction"] = {
      state: "loading",
      type: "actionReload",
      submission,
      location
    };

    update({
      transition: loadTransition,
      actionData: { [leafMatch.route.id]: result.value }
    });

    await loadPageData(
      location,
      matches,
      submission,
      leafMatch.route.id,
      result
    );
  }

  async function handleLoaderSubmissionNavigation(
    location: Location,
    submission: LoaderSubmission,
    matches: ClientMatch[]
  ) {
    abortNormalNavigation();
    let transition: TransitionStates["SubmittingLoader"] = {
      state: "submitting",
      type: "loaderSubmission",
      submission,
      location
    };
    update({ transition, nextMatches: matches });
    await loadPageData(location, matches, submission);
  }

  async function handleHashChange(location: Location, matches: ClientMatch[]) {
    abortNormalNavigation();
    let transition: TransitionStates["Loading"] = {
      state: "loading",
      type: "normalLoad",
      submission: undefined,
      location
    };
    update({ transition, nextMatches: matches });
    // Force async so UI code doesn't have to special case hash changes not
    // skipping the pending state (like scroll restoration gets really
    // complicated without the pending state, maybe we can figure something else
    // out later, but this works great.)
    await Promise.resolve();
    update({
      location,
      matches,
      transition: IDLE_TRANSITION
    });
  }

  async function handleLoad(location: Location, matches: ClientMatch[]) {
    abortNormalNavigation();
    let transition: TransitionStates["Loading"] = {
      state: "loading",
      type: "normalLoad",
      submission: undefined,
      location
    };
    update({ transition, nextMatches: matches });
    await loadPageData(location, matches);
  }

  async function handleLoaderRedirect(
    location: Location,
    matches: ClientMatch[]
  ) {
    abortNormalNavigation();
    let transition: TransitionStates["LoadingRedirect"] = {
      state: "loading",
      type: "normalRedirect",
      submission: undefined,
      location
    };
    update({ transition, nextMatches: matches });
    await loadPageData(location, matches);
  }

  async function handleLoaderSubmissionRedirect(
    location: Location,
    matches: ClientMatch[]
  ) {
    abortNormalNavigation();
    invariant(
      state.transition.type === "loaderSubmission",
      `Unexpected transition: ${JSON.stringify(state.transition)}`
    );
    let { submission } = state.transition;
    let transition: TransitionStates["LoadingLoaderSubmissionRedirect"] = {
      state: "loading",
      type: "loaderSubmissionRedirect",
      submission,
      location: location
    };
    update({ transition, nextMatches: matches });
    await loadPageData(location, matches, submission);
  }

  async function handleFetchActionRedirect(
    location: Location,
    matches: ClientMatch[]
  ) {
    abortNormalNavigation();
    let transition: TransitionStates["LoadingFetchActionRedirect"] = {
      state: "loading",
      type: "fetchActionRedirect",
      submission: undefined,
      location
    };
    update({ transition, nextMatches: matches });
    await loadPageData(location, matches);
  }

  async function handleActionRedirect(
    location: Location,
    matches: ClientMatch[]
  ) {
    abortNormalNavigation();
    invariant(
      state.transition.type === "actionSubmission" ||
        // loader redirected during action reload
        state.transition.type === "actionReload",
      `Unexpected transition: ${JSON.stringify(state.transition)}`
    );
    let { submission } = state.transition;
    let transition: TransitionStates["LoadingActionRedirect"] = {
      state: "loading",
      type: "actionRedirect",
      submission,
      location
    };
    update({ transition, nextMatches: matches });
    await loadPageData(location, matches, submission);
  }

  function isHashChangeOnly(location: Location) {
    return (
      createHref(state.location) === createHref(location) &&
      state.location.hash !== location.hash
    );
  }

  async function loadPageData(
    location: Location,
    matches: ClientMatch[],
    submission?: Submission,
    submissionRouteId?: string,
    actionResult?: DataResult
  ) {
    let maybeActionErrorResult =
      actionResult && isErrorResult(actionResult) ? actionResult : undefined;

    let maybeActionCatchResult =
      actionResult && isCatchResult(actionResult) ? actionResult : undefined;

    let controller = new AbortController();
    pendingNavigationController = controller;
    navigationLoadId = ++incrementingLoadId;

    let results = await callLoaders(
      state,
      createUrl(createHref(location)),
      matches,
      controller.signal,
      maybeActionErrorResult,
      maybeActionCatchResult,
      submission,
      submissionRouteId
    );

    if (controller.signal.aborted) {
      return;
    }

    let redirect = findRedirect(results);
    if (redirect) {
      // loader redirected during an action reload, treat it like an
      // actionRedirect instead so that all the loaders get called again and the
      // submission sticks around for optimistic/pending UI.
      if (state.transition.type === "actionReload") {
        let locationState: Redirects["Action"] = {
          isRedirect: true,
          type: "action"
        };
        init.onRedirect(redirect.location, locationState);
      } else if (state.transition.type === "loaderSubmission") {
        let locationState: Redirects["LoaderSubmission"] = {
          isRedirect: true,
          type: "loaderSubmission"
        };
        init.onRedirect(redirect.location, locationState);
      } else {
        let locationState: Redirects["Loader"] = {
          isRedirect: true,
          type: "loader"
        };
        init.onRedirect(redirect.location, locationState);
      }
      return;
    }

    let [error, errorBoundaryId] = findErrorAndBoundaryId(
      results,
      matches,
      maybeActionErrorResult
    );

    let [catchVal, catchBoundaryId] = await findCatchAndBoundaryId(
      results,
      matches,
      maybeActionErrorResult
    );

    let abortedIds = abortStaleFetchLoads(navigationLoadId);
    if (abortedIds) {
      markFetchersDone(abortedIds);
    }

    update({
      location,
      matches,
      error,
      errorBoundaryId,
      catch: catchVal,
      catchBoundaryId,
      loaderData: makeLoaderData(state, results, matches),
      actionData:
        state.transition.type === "actionReload" ? state.actionData : undefined,
      transition: IDLE_TRANSITION,
      fetchers: abortedIds ? new Map(state.fetchers) : state.fetchers
    });
  }

  function abortNormalNavigation() {
    pendingNavigationController?.abort();
  }

  function abortFetcher(key: string) {
    let controller = fetchControllers.get(key);
    invariant(controller, `Expected fetch controller: ${key}`);
    controller.abort();
    fetchControllers.delete(key);
  }

  return {
    send,
    getState,
    getFetcher,
    deleteFetcher,
    dispose,
    get _internalFetchControllers() {
      return fetchControllers;
    }
  };
}

////////////////////////////////////////////////////////////////////////////////
function isIndexRequestAction(action: string) {
  let indexRequest = false;

  let searchParams = new URLSearchParams(action.split("?", 2)[1] || "");
  for (let param of searchParams.getAll("index")) {
    if (!param) {
      indexRequest = true;
    }
  }

  return indexRequest;
}

async function callLoaders(
  state: TransitionManagerState,
  url: URL,
  matches: ClientMatch[],
  signal: AbortSignal,
  actionErrorResult?: DataErrorResult,
  actionCatchResult?: DataCatchResult,
  submission?: Submission,
  submissionRouteId?: string,
  fetcher?: Fetcher
): Promise<DataResult[]> {
  let matchesToLoad = filterMatchesToLoad(
    state,
    url,
    matches,
    actionErrorResult,
    actionCatchResult,
    submission,
    submissionRouteId,
    fetcher
  );

  return Promise.all(
    matchesToLoad.map(match => callLoader(match, url, signal))
  );
}

async function callLoader(match: ClientMatch, url: URL, signal: AbortSignal) {
  invariant(match.route.loader, `Expected loader for ${match.route.id}`);
  try {
    let { params } = match;
    let value = await match.route.loader({ params, url, signal });
    return { match, value };
  } catch (error) {
    return { match, value: error };
  }
}

async function callAction(
  submission: ActionSubmission,
  match: ClientMatch,
  signal: AbortSignal
): Promise<DataResult> {
  if (!match.route.action) {
    throw new Error(
      `Route "${match.route.id}" does not have an action, but you are trying ` +
        `to submit to it. To fix this, please add an \`action\` function to the route`
    );
  }

  try {
    let value = await match.route.action({
      url: createUrl(submission.action),
      params: match.params,
      submission,
      signal
    });
    return { match, value };
  } catch (error) {
    return { match, value: error };
  }
}

function filterMatchesToLoad(
  state: TransitionManagerState,
  url: URL,
  matches: ClientMatch[],
  actionErrorResult?: DataErrorResult,
  actionCatchResult?: DataCatchResult,
  submission?: Submission,
  submissionRouteId?: string,
  fetcher?: Fetcher
): ClientMatch[] {
  // Filter out all routes below the problematic route as they aren't going
  // to render so we don't need to load them.
  if (submissionRouteId && (actionCatchResult || actionErrorResult)) {
    let foundProblematicRoute = false;
    matches = matches.filter(match => {
      if (foundProblematicRoute) {
        return false;
      }
      if (match.route.id === submissionRouteId) {
        foundProblematicRoute = true;
        return false;
      }
      return true;
    });
  }

  let isNew = (match: ClientMatch, index: number) => {
    // [a] -> [a, b]
    if (!state.matches[index]) return true;

    // [a, b] -> [a, c]
    return match.route.id !== state.matches[index].route.id;
  };

  let matchPathChanged = (match: ClientMatch, index: number) => {
    return (
      // param change, /users/123 -> /users/456
      state.matches[index].pathname !== match.pathname ||
      // splat param changed, which is not present in match.path
      // e.g. /files/images/avatar.jpg -> files/finances.xls
      (state.matches[index].route.path?.endsWith("*") &&
        state.matches[index].params["*"] !== match.params["*"])
    );
  };

  let filterByRouteProps = (match: ClientMatch, index: number) => {
    if (!match.route.loader) {
      return false;
    }

    if (isNew(match, index) || matchPathChanged(match, index)) {
      return true;
    }

    if (match.route.shouldReload) {
      let prevUrl = createUrl(createHref(state.location));
      return match.route.shouldReload({
        prevUrl,
        url,
        submission,
        params: match.params
      });
    }

    return true;
  };

  let isInRootCatchBoundary = state.matches.length === 1;
  if (isInRootCatchBoundary) {
    return matches.filter(match => !!match.route.loader);
  }

  if (fetcher?.type === "actionReload") {
    return matches.filter(filterByRouteProps);
  } else if (
    // mutation, reload for fresh data
    state.transition.type === "actionReload" ||
    state.transition.type === "actionRedirect" ||
    // clicked the same link, resubmitted a GET form
    createHref(url) === createHref(state.location) ||
    // search affects all loaders
    url.searchParams.toString() !== state.location.search
  ) {
    return matches.filter(filterByRouteProps);
  }

  return matches.filter((match, index, arr) => {
    // don't load errored action route
    if ((actionErrorResult || actionCatchResult) && arr.length - 1 === index) {
      return false;
    }

    return (
      match.route.loader &&
      (isNew(match, index) || matchPathChanged(match, index))
    );
  });
}

function isRedirectResult(result: DataResult): result is DataRedirectResult {
  return result.value instanceof TransitionRedirect;
}

function createHref(location: Location | URL) {
  return location.pathname + location.search;
}

function findRedirect(results: DataResult[]): TransitionRedirect | null {
  for (let result of results) {
    if (isRedirectResult(result)) {
      return result.value;
    }
  }
  return null;
}

async function findCatchAndBoundaryId(
  results: DataResult[],
  matches: ClientMatch[],
  actionCatchResult?: DataCatchResult
): Promise<[CatchData, string | null] | [undefined, undefined]> {
  let loaderCatchResult: DataCatchResult | undefined;

  for (let result of results) {
    if (isCatchResult(result)) {
      loaderCatchResult = result;
      break;
    }
  }

  let extractCatchData = async (res: CatchValue) => ({
    status: res.status,
    statusText: res.statusText,
    data: res.data
  });

  // Weird case where action threw, and then a parent loader ALSO threw, we
  // use the action catch but the loader's nearest boundary (cause we can't
  // render down to the boundary the action would prefer)
  if (actionCatchResult && loaderCatchResult) {
    let boundaryId = findNearestCatchBoundary(loaderCatchResult.match, matches);
    return [await extractCatchData(actionCatchResult.value), boundaryId];
  }

  if (loaderCatchResult) {
    let boundaryId = findNearestCatchBoundary(loaderCatchResult.match, matches);
    return [await extractCatchData(loaderCatchResult.value), boundaryId];
  }

  return [undefined, undefined];
}

function findErrorAndBoundaryId(
  results: DataResult[],
  matches: ClientMatch[],
  actionErrorResult?: DataErrorResult
): [Error, string | null] | [undefined, undefined] {
  let loaderErrorResult;

  for (let result of results) {
    if (isErrorResult(result)) {
      loaderErrorResult = result;
      break;
    }
  }

  // Weird case where action errored, and then a parent loader ALSO errored, we
  // use the action error but the loader's nearest boundary (cause we can't
  // render down to the boundary the action would prefer)
  if (actionErrorResult && loaderErrorResult) {
    let boundaryId = findNearestBoundary(loaderErrorResult.match, matches);
    return [actionErrorResult.value, boundaryId];
  }

  if (actionErrorResult) {
    let boundaryId = findNearestBoundary(actionErrorResult.match, matches);
    return [actionErrorResult.value, boundaryId];
  }

  if (loaderErrorResult) {
    let boundaryId = findNearestBoundary(loaderErrorResult.match, matches);
    return [loaderErrorResult.value, boundaryId];
  }

  return [undefined, undefined];
}

function findNearestCatchBoundary(
  matchWithError: ClientMatch,
  matches: ClientMatch[]
): string | null {
  let nearestBoundaryId: null | string = null;
  for (let match of matches) {
    if (match.route.CatchBoundary) {
      nearestBoundaryId = match.route.id;
    }

    // only search parents (stop at throwing match)
    if (match === matchWithError) {
      break;
    }
  }

  return nearestBoundaryId;
}

function findNearestBoundary(
  matchWithError: ClientMatch,
  matches: ClientMatch[]
): string | null {
  let nearestBoundaryId: null | string = null;
  for (let match of matches) {
    if (match.route.ErrorBoundary) {
      nearestBoundaryId = match.route.id;
    }

    // only search parents (stop at throwing match)
    if (match === matchWithError) {
      break;
    }
  }

  return nearestBoundaryId;
}

function makeLoaderData(
  state: TransitionManagerState,
  results: DataResult[],
  matches: ClientMatch[]
) {
  let newData: RouteData = {};
  for (let { match, value } of results) {
    newData[match.route.id] = value;
  }

  let loaderData: RouteData = {};
  for (let { route } of matches) {
    let value =
      newData[route.id] !== undefined
        ? newData[route.id]
        : state.loaderData[route.id];
    if (value !== undefined) {
      loaderData[route.id] = value;
    }
  }

  return loaderData;
}

function isCatchResult(result: DataResult): result is DataCatchResult {
  return result.value instanceof CatchValue;
}

function isErrorResult(result: DataResult) {
  return result.value instanceof Error;
}

function createUrl(href: string) {
  return new URL(href, window.location.origin);
}
