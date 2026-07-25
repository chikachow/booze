import type { ReactElement } from "react";

import {
  bottleTitle,
  bottleFacts,
  drinkLabel,
  drinkWindow,
  grapeSummary,
  storageLocationPath,
  wineDisplayBrand,
  wineOrigin,
  type InventoryGrouping,
  type InventoryItem,
  type LocationItem,
} from "./inventory-model.ts";

/* oxlint-disable eslint/no-use-before-define */

type InventoryAreaProps = {
  readonly drinkStatusFilter: string;
  readonly drinkStatusOptions: readonly SelectOption[];
  readonly filter: string;
  readonly grouping: InventoryGrouping;
  readonly items: readonly InventoryItem[];
  readonly editableSiteIds: ReadonlySet<string>;
  readonly locationFilter: string;
  readonly locationOptions: readonly string[];
  readonly locations: readonly LocationItem[];
  readonly varietalFilter: string;
  readonly varietalOptions: readonly string[];
  readonly setDrinkStatusFilter: (value: string) => void;
  readonly setFilter: (value: string) => void;
  readonly setGrouping: (value: InventoryGrouping) => void;
  readonly setLocationFilter: (value: string) => void;
  readonly setVarietalFilter: (value: string) => void;
  readonly onAddBottle: () => void;
  readonly onEditBottle: (item: InventoryItem) => void;
};

type SelectOption = {
  readonly label: string;
  readonly value: string;
};

type WineRow = {
  readonly bottleCount: number;
  readonly bottles: readonly InventoryItem[];
  readonly item: InventoryItem;
};

export function InventoryArea({
  drinkStatusFilter,
  drinkStatusOptions,
  filter,
  grouping,
  items,
  editableSiteIds,
  locationFilter,
  locationOptions,
  locations,
  varietalFilter,
  varietalOptions,
  setDrinkStatusFilter,
  setFilter,
  setGrouping,
  setLocationFilter,
  setVarietalFilter,
  onAddBottle,
  onEditBottle,
}: InventoryAreaProps): ReactElement {
  return (
    <section className="workspace" aria-labelledby="inventory-title">
      <div className="workspace-header">
        <div>
          <p>Inventory</p>
          <h2 id="inventory-title">Browse bottles</h2>
        </div>
        {editableSiteIds.size === 0 ? null : (
          <button className="primary-action header-action" type="button" onClick={onAddBottle}>
            Add bottle
          </button>
        )}
      </div>

      <div className="inventory-controls">
        <div className="view-tabs two-up" aria-label="Inventory grouping">
          {(["winery", "storage"] satisfies readonly InventoryGrouping[]).map((groupValue) => (
            <button
              className={grouping === groupValue ? "is-active" : ""}
              key={groupValue}
              type="button"
              onClick={() => {
                setGrouping(groupValue);
              }}
            >
              {groupValue === "winery" ? "Winery" : "Storage"}
            </button>
          ))}
        </div>
      </div>

      <label className="search-field">
        Search bottles
        <input
          value={filter}
          onChange={(event) => {
            setFilter(event.currentTarget.value);
          }}
          placeholder="site, location, wine, grape"
        />
      </label>

      <div className="filter-row" aria-label="Inventory filters">
        <label>
          Varietal
          <select
            value={varietalFilter}
            onChange={(event) => {
              setVarietalFilter(event.currentTarget.value);
            }}
          >
            <option value="">All varietals</option>
            {varietalOptions.map((varietal) => (
              <option key={varietal} value={varietal}>
                {varietal}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location
          <select
            value={locationFilter}
            onChange={(event) => {
              setLocationFilter(event.currentTarget.value);
            }}
          >
            <option value="">All locations</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>
        <label>
          Drink status
          <select
            value={drinkStatusFilter}
            onChange={(event) => {
              setDrinkStatusFilter(event.currentTarget.value);
            }}
          >
            <option value="">All statuses</option>
            {drinkStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <h3>No matching bottles</h3>
          <p>Catalogue bottles with drink windows and locations to make this view useful.</p>
        </div>
      ) : grouping === "winery" ? (
        <WineryInventory
          editableSiteIds={editableSiteIds}
          items={items}
          locations={locations}
          onEditBottle={onEditBottle}
        />
      ) : (
        <StorageInventory
          editableSiteIds={editableSiteIds}
          items={items}
          locations={locations}
          onEditBottle={onEditBottle}
        />
      )}
    </section>
  );
}

function WineryInventory({
  editableSiteIds,
  items,
  locations,
  onEditBottle,
}: {
  readonly editableSiteIds: ReadonlySet<string>;
  readonly items: readonly InventoryItem[];
  readonly locations: readonly LocationItem[];
  readonly onEditBottle: (item: InventoryItem) => void;
}): ReactElement {
  const groups = groupBy(items, (item) => wineDisplayBrand(item) || "Unknown winery");
  return (
    <div className="inventory-groups">
      {groups.map((group) => (
        <section className="inventory-group" key={group.key}>
          <div className="group-heading">
            <h3>{group.key}</h3>
            <span>{wineGroupSummary(group.items)}</span>
          </div>
          <div className="inventory-list">
            {wineRows(group.items).map((row) => (
              <WineCard
                editable={editableSiteIds.has(row.item.siteId)}
                key={row.item.wineVintageId}
                locations={locations}
                row={row}
                onEditBottle={onEditBottle}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function StorageInventory({
  editableSiteIds,
  items,
  locations,
  onEditBottle,
}: {
  readonly editableSiteIds: ReadonlySet<string>;
  readonly items: readonly InventoryItem[];
  readonly locations: readonly LocationItem[];
  readonly onEditBottle: (item: InventoryItem) => void;
}): ReactElement {
  const siteGroups = groupBy(items, (item) => item.site);
  return (
    <div className="inventory-groups">
      {siteGroups.map((siteGroup) => (
        <section className="inventory-group" key={siteGroup.key}>
          <div className="group-heading">
            <h3>{siteGroup.key}</h3>
            <span>{wineGroupSummary(siteGroup.items)}</span>
          </div>
          {groupBy(siteGroup.items, (item) => storageLocationPath(item, locations)).map(
            (locationGroup) => (
              <section className="nested-group" key={`${siteGroup.key}-${locationGroup.key}`}>
                <div className="nested-heading">
                  <h4>{locationGroup.key}</h4>
                  <span>{wineGroupSummary(locationGroup.items)}</span>
                </div>
                <div className="inventory-list">
                  {wineRows(locationGroup.items).map((row) => (
                    <WineCard
                      editable={editableSiteIds.has(row.item.siteId)}
                      key={row.item.wineVintageId}
                      locations={locations}
                      row={row}
                      onEditBottle={onEditBottle}
                    />
                  ))}
                </div>
              </section>
            ),
          )}
        </section>
      ))}
    </div>
  );
}

function groupBy(
  items: readonly InventoryItem[],
  keyForItem: (item: InventoryItem) => string,
): readonly { readonly key: string; readonly items: readonly InventoryItem[] }[] {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = keyForItem(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([key, groupItems]) => ({ key, items: groupItems }))
    .toSorted((left, right) => left.key.localeCompare(right.key));
}

function wineRows(items: readonly InventoryItem[]): readonly WineRow[] {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of items) {
    groups.set(item.wineVintageId, [...(groups.get(item.wineVintageId) ?? []), item]);
  }
  const rows: WineRow[] = [];
  for (const bottles of groups.values()) {
    const item = bottles[0];
    if (item === undefined) {
      continue;
    }
    rows.push({
      bottleCount: bottles.length,
      bottles,
      item,
    });
  }
  return rows.toSorted((left, right) =>
    bottleTitle(left.item).localeCompare(bottleTitle(right.item)),
  );
}

function wineGroupSummary(items: readonly InventoryItem[]): string {
  const wineCount = wineRows(items).length;
  const bottleCount = items.length;
  return wineCount === bottleCount
    ? countLabel(bottleCount, "bottle")
    : `${countLabel(wineCount, "wine")} / ${countLabel(bottleCount, "bottle")}`;
}

function countLabel(count: number, singular: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${singular}s`;
}

function WineCard({
  editable,
  locations,
  row,
  onEditBottle,
}: {
  readonly editable: boolean;
  readonly locations: readonly LocationItem[];
  readonly row: WineRow;
  readonly onEditBottle: (item: InventoryItem) => void;
}): ReactElement {
  const item = row.item;
  return (
    <article className={`bottle-card drink-${item.drinkStatus}`}>
      <div className="bottle-row-main">
        <div className="bottle-row-title">
          <h3>{bottleTitle(item)}</h3>
          <p>{wineSubtitle(row, locations)}</p>
        </div>
        <span className="status-pill">{drinkLabel(item.drinkStatus)}</span>
        {row.bottleCount === 1 ? null : (
          <span className="status-pill bottle-count-pill">{row.bottleCount} bottles</span>
        )}
      </div>
      <p className="bottle-row-meta">
        {[grapeSummary(item), wineOrigin(item), bottleFacts(item), `Drink ${drinkWindow(item)}`]
          .filter((value) => value !== "")
          .join(" - ")}
      </p>
      <div className="card-actions">
        {editable ? (
          <button
            type="button"
            onClick={() => {
              onEditBottle(item);
            }}
          >
            Edit
          </button>
        ) : null}
        {item.sourceUrl === null ? null : (
          <a href={item.sourceUrl} rel="noreferrer" target="_blank">
            Source
          </a>
        )}
      </div>
    </article>
  );
}

function wineSubtitle(row: WineRow, locations: readonly LocationItem[]): string {
  const item = row.item;
  const storagePaths = uniqueSorted(
    row.bottles.map((bottle) => storagePathLabel(bottle, locations)),
  );
  const storageSummary = storagePaths.slice(0, 3).join(" / ");
  const storageLabel =
    storagePaths.length > 3
      ? `${storageSummary} / +${storagePaths.length - 3} more`
      : storageSummary;
  return [wineBrandLabel(item), storageLabel].filter((value) => value !== "").join(" - ");
}

function wineBrandLabel(item: InventoryItem): string {
  const brandName = item.brandName?.trim();
  return brandName === undefined || brandName === "" || brandName === item.wineryName
    ? item.wineryName
    : `${item.wineryName} / ${brandName}`;
}

function storagePathLabel(item: InventoryItem, locations: readonly LocationItem[]): string {
  return [item.site, storageLocationPath(item, locations), item.position]
    .filter((value) => value !== null && value !== "")
    .join(" / ");
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value !== ""))].toSorted((left, right) =>
    left.localeCompare(right),
  );
}
