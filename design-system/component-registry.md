# Component Registry

## Components (viewer, `src/viewer/`)

| Name | Path | Description |
|------|------|-------------|
| FlowCanvas | `src/viewer/components/flow/flow-canvas.tsx` | Main @xyflow/react canvas viewport with controls & minimap |
| ScreenNode | `src/viewer/components/flow/screen-node.tsx` | Frame card for a Route Screen or State Screen with preview & trigger handles |
| ActionEdge | `src/viewer/components/flow/action-edge.tsx` | Curved edge with trigger pill; dashed + badge when confidence is `low` |
| StoryFilterBar | `src/viewer/components/flow/story-filter-bar.tsx` | Floating bar: Story Manifest dropdown, entry node picker, depth slider |
| ScreenDetailDrawer | `src/viewer/components/flow/screen-detail-drawer.tsx` | Drawer showing detected triggers, evidence snippets, confidence |
| UnlinkedScreensTray | `src/viewer/components/flow/unlinked-screens-tray.tsx` | Tray listing orphan screens with no inbound/outbound edges |
