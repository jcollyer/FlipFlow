/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams:
        | { pathname: Router.RelativePathString; params?: Router.UnknownInputParams }
        | { pathname: Router.ExternalPathString; params?: Router.UnknownInputParams }
        | { pathname: `/signin`; params?: Router.UnknownInputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownInputParams }
        | {
            pathname: `${'/(app)'}/all-cards-practice` | `/all-cards-practice`;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `${'/(app)'}/all-cards` | `/all-cards`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/favorites` | `/favorites`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}` | `/`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/new-card` | `/new-card`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/new-deck` | `/new-deck`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/settings` | `/settings`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/folders` | `/folders`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/groups` | `/groups`; params?: Router.UnknownInputParams }
        | {
            pathname: `${'/(app)'}/cards/[id]/edit` | `/cards/[id]/edit`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/edit` | `/decks/[id]/edit`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]` | `/decks/[id]`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/new-card` | `/decks/[id]/new-card`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/practice` | `/decks/[id]/practice`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/groups/[id]` | `/groups/[id]`;
            params: Router.UnknownInputParams & { id: string | number };
          };
      hrefOutputParams:
        | { pathname: Router.RelativePathString; params?: Router.UnknownOutputParams }
        | { pathname: Router.ExternalPathString; params?: Router.UnknownOutputParams }
        | { pathname: `/signin`; params?: Router.UnknownOutputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams }
        | {
            pathname: `${'/(app)'}/all-cards-practice` | `/all-cards-practice`;
            params?: Router.UnknownOutputParams;
          }
        | { pathname: `${'/(app)'}/all-cards` | `/all-cards`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/favorites` | `/favorites`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}` | `/`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/new-card` | `/new-card`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/new-deck` | `/new-deck`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/settings` | `/settings`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/folders` | `/folders`; params?: Router.UnknownOutputParams }
        | { pathname: `${'/(app)'}/groups` | `/groups`; params?: Router.UnknownOutputParams }
        | {
            pathname: `${'/(app)'}/cards/[id]/edit` | `/cards/[id]/edit`;
            params: Router.UnknownOutputParams & { id: string };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/edit` | `/decks/[id]/edit`;
            params: Router.UnknownOutputParams & { id: string };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]` | `/decks/[id]`;
            params: Router.UnknownOutputParams & { id: string };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/new-card` | `/decks/[id]/new-card`;
            params: Router.UnknownOutputParams & { id: string };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/practice` | `/decks/[id]/practice`;
            params: Router.UnknownOutputParams & { id: string };
          }
        | {
            pathname: `${'/(app)'}/groups/[id]` | `/groups/[id]`;
            params: Router.UnknownOutputParams & { id: string };
          };
      href:
        | Router.RelativePathString
        | Router.ExternalPathString
        | `/signin${`?${string}` | `#${string}` | ''}`
        | `/_sitemap${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/all-cards-practice${`?${string}` | `#${string}` | ''}`
        | `/all-cards-practice${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/all-cards${`?${string}` | `#${string}` | ''}`
        | `/all-cards${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/favorites${`?${string}` | `#${string}` | ''}`
        | `/favorites${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}${`?${string}` | `#${string}` | ''}`
        | `/${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/new-card${`?${string}` | `#${string}` | ''}`
        | `/new-card${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/new-deck${`?${string}` | `#${string}` | ''}`
        | `/new-deck${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/settings${`?${string}` | `#${string}` | ''}`
        | `/settings${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/folders${`?${string}` | `#${string}` | ''}`
        | `/folders${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/groups${`?${string}` | `#${string}` | ''}`
        | `/groups${`?${string}` | `#${string}` | ''}`
        | { pathname: Router.RelativePathString; params?: Router.UnknownInputParams }
        | { pathname: Router.ExternalPathString; params?: Router.UnknownInputParams }
        | { pathname: `/signin`; params?: Router.UnknownInputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownInputParams }
        | {
            pathname: `${'/(app)'}/all-cards-practice` | `/all-cards-practice`;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `${'/(app)'}/all-cards` | `/all-cards`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/favorites` | `/favorites`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}` | `/`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/new-card` | `/new-card`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/new-deck` | `/new-deck`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/settings` | `/settings`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/folders` | `/folders`; params?: Router.UnknownInputParams }
        | { pathname: `${'/(app)'}/groups` | `/groups`; params?: Router.UnknownInputParams }
        | `${'/(app)'}/cards/${Router.SingleRoutePart<T>}/edit${`?${string}` | `#${string}` | ''}`
        | `/cards/${Router.SingleRoutePart<T>}/edit${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/decks/${Router.SingleRoutePart<T>}/edit${`?${string}` | `#${string}` | ''}`
        | `/decks/${Router.SingleRoutePart<T>}/edit${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/decks/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}`
        | `/decks/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/decks/${Router.SingleRoutePart<T>}/new-card${`?${string}` | `#${string}` | ''}`
        | `/decks/${Router.SingleRoutePart<T>}/new-card${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/decks/${Router.SingleRoutePart<T>}/practice${`?${string}` | `#${string}` | ''}`
        | `/decks/${Router.SingleRoutePart<T>}/practice${`?${string}` | `#${string}` | ''}`
        | `${'/(app)'}/groups/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}`
        | `/groups/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}`
        | {
            pathname: `${'/(app)'}/cards/[id]/edit` | `/cards/[id]/edit`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/edit` | `/decks/[id]/edit`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]` | `/decks/[id]`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/new-card` | `/decks/[id]/new-card`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/decks/[id]/practice` | `/decks/[id]/practice`;
            params: Router.UnknownInputParams & { id: string | number };
          }
        | {
            pathname: `${'/(app)'}/groups/[id]` | `/groups/[id]`;
            params: Router.UnknownInputParams & { id: string | number };
          };
    }
  }
}
