import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useMemo, useState, type ReactElement } from "react";

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
import { ProgressiveListStatus } from "./ProgressiveListStatus.tsx";

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

const INVENTORY_PAGE_SIZE = 100;

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
  const [visibleItemCount, setVisibleItemCount] = useState(INVENTORY_PAGE_SIZE);
  const visibleItems = useMemo(() => items.slice(0, visibleItemCount), [items, visibleItemCount]);

  useEffect(() => {
    setVisibleItemCount(INVENTORY_PAGE_SIZE);
  }, [drinkStatusFilter, filter, grouping, locationFilter, varietalFilter]);

  return (
    <section className="workspace" aria-labelledby="inventory-title">
      <div className="workspace-header">
        <div>
          <p>Inventory</p>
          <h2 id="inventory-title">Browse bottles</h2>
        </div>
        {editableSiteIds.size === 0 ? null : (
          <Button
            id="add-bottle-trigger"
            label="Add bottle"
            variant="primary"
            onClick={onAddBottle}
          />
        )}
      </div>

      <div className="inventory-controls">
        <SegmentedControl
          label="Inventory grouping"
          value={grouping}
          onChange={(value: string) => {
            if (value === "winery" || value === "storage") {
              setGrouping(value);
            }
          }}
        >
          <SegmentedControlItem label="Winery" value="winery" />
          <SegmentedControlItem label="Storage" value="storage" />
        </SegmentedControl>
      </div>

      <TextInput
        autoComplete="off"
        hasClear
        htmlName="inventorySearch"
        label="Search bottles"
        placeholder="Site, location, wine, or grape"
        startIcon="search"
        value={filter}
        onChange={setFilter}
      />

      <div className="filter-row" aria-label="Inventory filters">
        <Selector
          hasClear
          htmlName="varietalFilter"
          label="Varietal"
          options={varietalOptions.map((varietal) => ({ label: varietal, value: varietal }))}
          placeholder="All varietals"
          value={varietalFilter}
          onChange={(value: string | null) => {
            setVarietalFilter(value ?? "");
          }}
        />
        <Selector
          hasClear
          htmlName="locationFilter"
          label="Location"
          options={locationOptions.map((location) => ({ label: location, value: location }))}
          placeholder="All locations"
          value={locationFilter}
          onChange={(value: string | null) => {
            setLocationFilter(value ?? "");
          }}
        />
        <Selector
          hasClear
          htmlName="drinkStatusFilter"
          label="Drink status"
          options={drinkStatusOptions}
          placeholder="All statuses"
          value={drinkStatusFilter}
          onChange={(value: string | null) => {
            setDrinkStatusFilter(value ?? "");
          }}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          description="Catalogue bottles with drink windows and locations, or clear the active filters."
          title="No matching bottles"
        />
      ) : grouping === "winery" ? (
        <WineryInventory
          editableSiteIds={editableSiteIds}
          items={visibleItems}
          locations={locations}
          onEditBottle={onEditBottle}
        />
      ) : (
        <StorageInventory
          editableSiteIds={editableSiteIds}
          items={visibleItems}
          locations={locations}
          onEditBottle={onEditBottle}
        />
      )}
      <ProgressiveListStatus
        itemLabel="bottles"
        pageSize={INVENTORY_PAGE_SIZE}
        totalCount={items.length}
        visibleCount={visibleItems.length}
        onReveal={setVisibleItemCount}
      />
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
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      group.push(item);
    }
  }
  return [...groups.entries()]
    .map(([key, groupItems]) => ({ key, items: groupItems }))
    .toSorted((left, right) => left.key.localeCompare(right.key));
}

function wineRows(items: readonly InventoryItem[]): readonly WineRow[] {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const group = groups.get(item.wineVintageId);
    if (group === undefined) {
      groups.set(item.wineVintageId, [item]);
    } else {
      group.push(item);
    }
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
        <Badge label={drinkLabel(item.drinkStatus)} variant={drinkStatusBadge(item.drinkStatus)} />
        {row.bottleCount === 1 ? null : (
          <span className="bottle-count">{row.bottleCount} bottles</span>
        )}
      </div>
      <p className="bottle-row-meta">
        {[grapeSummary(item), wineOrigin(item), bottleFacts(item), `Drink ${drinkWindow(item)}`]
          .filter((value) => value !== "")
          .join(" - ")}
      </p>
      <div className="card-actions">
        {editable ? (
          <Button
            label="Edit"
            size="sm"
            variant="secondary"
            onClick={() => {
              onEditBottle(item);
            }}
          />
        ) : null}
        {item.sourceUrl === null ? null : (
          <Link isExternalLink href={item.sourceUrl}>
            Source
          </Link>
        )}
      </div>
    </article>
  );
}

function drinkStatusBadge(
  status: InventoryItem["drinkStatus"],
): "neutral" | "info" | "warning" | "error" {
  if (status === "past-window") {
    return "error";
  }
  if (status === "drink-now" || status === "drink-soon") {
    return "warning";
  }
  return status === "unknown" ? "neutral" : "info";
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
