# Coding Agent Guide: OrgDesigner Repository Rules & Architecture

Welcome! This document defines the architectural guidelines, domain terminology, and implementation rules for developers (human or AI) modifying the **OrgDesigner** workspace.

---

## 1. Nomenclature & Domain Terminology
To maintain consistency, you **MUST** use the following terms. Do not revert to older names (which may still appear in older database export versions but must be normalized upon import).

| Concept | Term to Use | Legacy/Internal Term (Do Not Use in UI) | Description |
| :--- | :--- | :--- | :--- |
| **Top-Level Tabs** | `Verticals` | Pages | Separate vertical groups or departments. |
| **Page-linking Columns** | `Vertical Links` | Page Links | Columns within a Vertical representing external links. |
| **Cross-Functional Bands** | `Transversals` | Cross Functional Layers / XFL | Horizontal bars spanning across columns. |
| **Executive / Sponsor** | `Top Lead` | Sponsor | The main lead/sponsor of a Vertical page. |
| **Team Leads** | `Line Manager` | Team Lead | The lead assigned to a specific team column. |

---

## 2. Technical Stack
- **Languages**: HTML5, Vanilla JavaScript (ES5/ES6), and Vanilla CSS3.
- **Frameworks**: None. Do not introduce React, Vue, jQuery, or utility frameworks unless explicitly requested.
- **Styling**: Standard CSS variables are defined in `:root` in [style.css](file:///i:/AntiGravity/OrgDesigner/style.css).
- **Icons**: Emoji characters (e.g. `✏️`, `🗑️`, `⬤`) are used for action buttons. Do not introduce icon libraries.

---

## 3. Core Architectural Files

### 1. [index.html](file:///i:/AntiGravity/OrgDesigner/index.html)
- Contains page layouts, sidebar sections (Verticals menu, Personnel pool), and action modals (Personnel creator, Transversal checklists).
- Always use textareas instead of inputs for multiline description inputs.

### 2. [app.js](file:///i:/AntiGravity/OrgDesigner/app.js)
- Manages the single-page application state `state` variable.
- Contains the central `emit(event)` dispatcher that triggers DOM redraws (`drawWorkspace()`, `drawPersonnel()`, etc.) and handles auto-saving.
- **Drag-and-Drop Handling**: Uses HTML5 drag-and-drop APIs. Items are registered via `makeDraggable` and zones via `makeDropZone`.
- **Personnel Normalization**: Custom mapping handles both older exports and new additions:
  ```javascript
  'Role Name': raw['Role Name'] || raw['role_name'] || raw['Role State'] || raw['role_state'] || ''
  ```

### 3. [style.css](file:///i:/AntiGravity/OrgDesigner/style.css)
- Contains layout structure rules, 3D flip card card transformations (`.flip-card`), and custom glassmorphism styles.
- Customizes visibility states based on parent containers (e.g., `#org-workspace.names-only-active`).

---

## 4. Coding & Design Standards

### Column Auto-Sorting Algorithm
- In `computeTeamOrder()`, column ordering is calculated using a **Nearest Neighbor path-finding algorithm**.
- The algorithm orders columns by the similarity of transversals they span, ensuring transversal horizontal bands span continuously without gaps. Modifying column order manually is not recommended.

### Mini-Card Layout (`.mini-card`)
- Cards in the matrix (both team members and line managers) are structured with centered inline elements.
- The rank badge is absolutely positioned:
  - `.mini-card` has `justify-content: center; text-align: center; position: relative; padding-right: 42px !important;`.
  - `.mini-card__rank` is a larger circle: `width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid; position: absolute; right: var(--space-md); top: 50%; transform: translateY(-50%);`.
  - In Names Only mode (`.names-only-active`), rank badges, role names, location text, and separators are hidden using CSS (`display: none !important`), and padding-right is reset to normal.

### Sidebar Collapse & Presentation Mode
- Toggle sidebar button adds/removes `.sidebar-collapsed` to the workspace container.
- When `.sidebar-collapsed` is active, edit and delete icons (`✏️`, `🗑️`) are automatically hidden inside the workspace layout.

---

## 5. State Persistence
- All state changes are synced to `localStorage` under `org_designer_state` via `saveState()`.
- State can be exported and imported using the JSON Toolbar actions. GPNs must remain unique identifiers.
