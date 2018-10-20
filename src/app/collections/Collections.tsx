import { DestinyProfileResponse } from 'bungie-api-ts/destiny2';
import * as React from 'react';
import * as _ from 'lodash';
import { DestinyAccount } from '../accounts/destiny-account.service';
import { getKiosks } from '../bungie-api/destiny2-api';
import { D2ManifestDefinitions, getDefinitions } from '../destiny2/d2-definitions.service';
import { D2ManifestService } from '../manifest/manifest-service';
import './collections.scss';
import { fetchRatingsForKiosks } from '../d2-vendors/vendor-ratings';
import { DimStore } from '../inventory/store-types';
import { t } from 'i18next';
import PlugSet from './PlugSet';
import ErrorBoundary from '../dim-ui/ErrorBoundary';
import Ornaments from './Ornaments';
import { D2StoresService } from '../inventory/d2-stores.service';
import { UIViewInjectedProps } from '@uirouter/react';
import { loadingTracker } from '../ngimport-more';
import Catalysts from './Catalysts';
import { Loading } from '../dim-ui/Loading';
import { refresh$ } from '../shell/refresh';
import { Subscriptions } from '../rx-utils';
import { InventoryBuckets } from '../inventory/inventory-buckets';
import { getBuckets } from '../destiny2/d2-buckets.service';

interface Props {
  account: DestinyAccount;
}

interface State {
  defs?: D2ManifestDefinitions;
  buckets?: InventoryBuckets;
  profileResponse?: DestinyProfileResponse;
  stores?: DimStore[];
  ownedItemHashes?: Set<number>;
}

/**
 * The collections screen that shows items you can get back from the vault, like emblems and exotics.
 */
export default class Collections extends React.Component<Props & UIViewInjectedProps, State> {
  private subscriptions = new Subscriptions();

  constructor(props: Props) {
    super(props);
    this.state = {};
  }

  async loadCollections() {
    // TODO: don't really have to serialize these...

    // TODO: defs as a property, not state
    const defs = await getDefinitions();
    D2ManifestService.loaded = true;
    const buckets = await getBuckets();

    const profileResponse = await getKiosks(this.props.account);
    this.setState({ profileResponse, defs, buckets });

    await fetchRatingsForKiosks(defs, profileResponse);
  }

  componentDidMount() {
    loadingTracker.addPromise(this.loadCollections());

    this.subscriptions.add(
      refresh$.subscribe(() => {
        // TODO: refresh just advisors
        D2StoresService.reloadStores();
      }),
      D2StoresService.getStoresStream(this.props.account).subscribe((stores) => {
        if (stores) {
          const ownedItemHashes = new Set<number>();
          for (const store of stores) {
            for (const item of store.items) {
              ownedItemHashes.add(item.hash);
            }
          }
          this.setState({ stores, ownedItemHashes });
        }
      })
    );
  }

  componentWillUnmount() {
    this.subscriptions.unsubscribe();
  }

  render() {
    const { defs, buckets, profileResponse } = this.state;

    if (!profileResponse || !defs || !buckets) {
      return (
        <div className="vendor d2-vendors dim-page">
          <Loading />
        </div>
      );
    }

    // TODO: a lot of this processing should happen at setState, not render?

    const plugSetHashes = new Set(Object.keys(profileResponse.profilePlugSets.data.plugs));
    _.each(profileResponse.characterPlugSets.data, (plugSet) => {
      _.each(plugSet.plugs, (_, plugSetHash) => {
        plugSetHashes.add(plugSetHash);
      });
    });

    return (
      <div className="vendor d2-vendors dim-page">
        <ErrorBoundary name="Ornaments">
          <Ornaments defs={defs} buckets={buckets} profileResponse={profileResponse} />
        </ErrorBoundary>
        <ErrorBoundary name="Catalysts">
          <Catalysts defs={defs} buckets={buckets} profileResponse={profileResponse} />
        </ErrorBoundary>
        <ErrorBoundary name="PlugSets">
          {Array.from(plugSetHashes).map((plugSetHash) => (
            <PlugSet
              key={plugSetHash}
              defs={defs}
              buckets={buckets}
              plugSetHash={Number(plugSetHash)}
              items={itemsForPlugSet(profileResponse, Number(plugSetHash))}
            />
          ))}
        </ErrorBoundary>
        <div className="collections-partners">
          <a
            className="collections-partner dim-button"
            target="_blank"
            rel="noopener"
            href="https://destinysets.com"
          >
            {t('Vendors.DestinySets')}
          </a>
          <a
            className="collections-partner dim-button"
            target="_blank"
            rel="noopener"
            href="https://lowlidev.com.au/destiny/maps"
          >
            {t('Vendors.DestinyMap')}
          </a>
        </div>
      </div>
    );
  }
}

function itemsForPlugSet(profileResponse: DestinyProfileResponse, plugSetHash: number) {
  return profileResponse.profilePlugSets.data.plugs[plugSetHash].concat(
    _.flatten(
      Object.values(profileResponse.characterPlugSets.data).map((d) => d.plugs[plugSetHash])
    )
  );
}
