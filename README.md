# OrgDesigner User Guide

Welcome to **OrgDesigner**, a premium, interactive web-based dashboard designed to help you organize and visualize departments, structural teams, cross-functional guilds, and personnel.

This guide covers all key concepts, interactive features, filtering options, and data sharing workflows to help you get the most out of the board.

---

## 1. Key Concepts

To make the layout consistent, the dashboard uses the following standard terms:

| Concept | Term to Use | Description |
| :--- | :--- | :--- |
| **Top-Level Tabs** | `Verticals` | Separate department or business division views (e.g. Sales, Engineering, HR). |
| **Cross-Functional Bands** | `Transversals` | Horizontal layers or guilds spanning across multiple teams (e.g. "Security Guild" or "Design System Team"). |
| **Executive / Sponsor** | `Top Lead` | The main overall director/lead of a Vertical page. |
| **Team Leads** | `Line Manager` | The lead assigned to a specific team column. |
| **Page-linking Columns** | `Vertical Links` | Columns within a page representing external links to other Vertical pages. |

### Verticals (Tabs)
Verticals represent different business units. Switching tabs in the header immediately swaps the entire board workspace. Creating a new Vertical automatically duplicates the current page's Section Lead as the Top Lead of the new page and creates a **Vertical Link** column on your current page.

### Teams (Columns)
Each team is displayed as a vertical column. Columns automatically sort themselves to align continuous horizontal **Transversal** project bands across them, minimizing layout gaps. 
* Each team column is led by a **Line Manager** and contains **Assigned People**.

### Transversals (Horizontal Bands)
Transversals track cross-functional programs or guilds that span across several teams.
* A single transversal can have **multiple leads** assigned inline.
* Transversal leads are shown with bullets color-coded by their rank, and they can be assigned to multiple transversals simultaneously.
* The length of a transversal band automatically scales to align flush with the right edge of the last team column it target-spans.

### Vertical Links
These columns link one Vertical page to another. They display the destination page's statistics (total teams and people) and the designated manager.

---

## 2. Interacting with the Board

### Drag and Drop
* **Assigning Personnel**: Drag employee cards from the left-hand **Personnel Pool** sidebar and drop them onto:
  - A team column's **Assigned People** area.
  - A team's **Line Manager** slot.
  - A **Transversal** band header to assign them as a lead.
* **Moving & Unassigning**: Drag cards between teams, or drag them back to the sidebar Personnel Pool to unassign them.

### Card Flipping (View Descriptions)
* Click on a Team Column Header or a Vertical Link card to flip it around.
* On the back of the card, you can view its description. Click the pencil icon (`✏️`) to open a multiline text area to update or add comments/notes.

### Presentation Mode
* Click the hamburger button (`☰`) in the top-left of the toolbar to collapse the sidebar.
* **Clean Layout**: In this mode, all edit/delete buttons and drag handles are hidden.
* **Smart Collapse**: If a team only has a Line Manager and `0` assigned members, the member slot, "0 ASSIGNED PEOPLE" header, and "LINE MANAGER" label will automatically collapse, compressing the team column to a compact card.

---

## 3. Personnel Directory & Filtering

### The Sidebar Personnel Pool
The sidebar lists all loaded personnel. Each card displays initials, name, location, and rank code. 
* **Details Tooltip**: Hover your mouse over any card to reveal details: GPN, Role name, current allocation percentage, active assignments, and notes.
* **Quick Edit**: Click the pencil icon (`✏️`) next to any sidebar card's drag handle to edit their details.
* **Assignment Badge**: Shows how many times they are assigned (e.g. `×2` if they are in two different teams).

### The Personnel Directory Modal
Click the search/filter controls in the sidebar or search bar to open the **Personnel Directory & Overview**:
* List view displaying detailed cards for all employees.
* Edit any profile using the pencil (`✏️`) icon next to the assignment status.
* **Advanced Filters**: Filter the roster by Rank, Region, Manager GPN, City, Country, or Allocation.
* **Hide Assigned Toggle**: Easily filter out people already placed on the board to see who is still available in the pool.

---

## 4. Sharing & Importing Data

### Offline Persistence
The tool automatically saves all changes in your browser's local cache. If you close the tab or refresh, your workspace remains exactly as you left it.

### Exporting and Sharing
Because data is private to your browser, other users visiting the URL will not see your board by default. To share:
1. Click **Export Workspace** in the top toolbar.
2. A file named `org-workspace-export.json` will download.
3. Share this file with colleagues via email, Teams, Slack, or OneDrive.
4. They can open the hosted link, click **Import Workspace**, and select the file to load your exact layout.

### Importing a Personnel Roster
You can bulk-load a list of personnel into the sidebar pool using a JSON file:
1. Click **Import Workspace** in the top toolbar.
2. Select your personnel JSON file.

#### Roster File Format Example
To construct your own roster file, create a text file ending in `.json` with the following structure:

```json
[
  {
    "GPN": "GPN001",
    "First Name": "Elena",
    "Last Name": "Martinez",
    "Rank Code": "DI",
    "Evaluating Manager": "GPN099",
    "Physical Location City": "Madrid",
    "Physical Location Country": "Spain",
    "Physical Location Region": "EMEA",
    "Role State": "Active",
    "Current Allocation": "100%",
    "New Allocation": "",
    "Comment": "EMEA Design Lead"
  },
  {
    "GPN": "GPN002",
    "First Name": "Wei",
    "Last Name": "Chen",
    "Rank Code": "AO",
    "Evaluating Manager": "GPN001",
    "Physical Location City": "Shanghai",
    "Physical Location Country": "China",
    "Physical Location Region": "APAC",
    "Role State": "Active",
    "Current Allocation": "80%",
    "New Allocation": "100%",
    "Comment": "Transitioning to lead role next month"
  }
]
```

#### Supported Fields:
* **GPN** (Required, Unique): Unique identification code for the person.
* **First Name** / **Last Name** (Required): Name displayed on the cards.
* **Rank Code**: Maps to visual tier colors. Options: `MD` (Managing Director), `ED` (Executive Director), `DI` (Director), `AD` (Associate Director), `AO` (Authorized Officer), `EE` (Employee), `IV` (Intern), `NA` (Not Applicable).
* **Evaluating Manager**: The GPN of their manager.
* **Location** (`Physical Location City`, `Physical Location Country`, `Physical Location Region`): Used for card details and location filters.
* **Allocation** (`Current Allocation`, `New Allocation`): Workload capacity details.
* **Comment**: Notes displayed on hover or in the directory detail view.
