# VRChat Media UI - Unity Project Documentation

## Overview
This project implements a **server-driven UI architecture** for VRChat, allowing a Plex backend to control what users see in-world. It uses VRChat's String Loading and Image Loading APIs to fetch content dynamically.

## Architecture

### 1. Server-Driven Navigation (Backend)
The Node.js backend (`plex-server`) determines the application state. The Unity client is "dumb" and renders what the server tells it to.

- **Endpoints**:
  - `/api/ui/home`: Returns the initial "Grid" screen configuration.
  - `/api/ui/slots/:id`: Returns a screen configuration for a specific interaction (e.g., clicking a movie).
- **Slots System**:
  - To avoid VRChat URL whitelist limitations, we use a finite set of pre-registered URLs ("Slots").
  - The backend maps a dynamic Plex item (e.g., Movie #9872) to a reusable Slot ID (e.g., Slot #5).
  - Unity requests `/api/ui/slots/5`, and the server knows that Slot #5 currently refers to Movie #9872.

### 2. Unity Components (Frontend)
Located in `vrchat-media-ui/Assets/Scripts/`.

#### `APIManager.cs`
The central hub for all network requests.
- **Responsibilities**:
  - Holds references to the static set of Slot URLs.
  - Performs `VRCStringDownloader` requests.
  - Receives the JSON response.
  - Routes the response to the appropriate "Screen Manager" based on `screenType` (e.g., "grid", "details").

#### `MediaGridManager.cs`
Handles the "Home" or "Library" view.
- **Responsibilities**:
  - Spawns a grid of `MediaItem` prefabs.
  - Manages **Texture Atlases**. The server combines many movie posters into a single large texture to reduce download calls.
  - Calculates UVs to display the correct portion of the atlas on each item.
  - Assigns an `actionSlotId` to each item so clicks trigger the correct API call.

#### `MediaDetailManager.cs`
Handles the "Single Movie" view.
- **Responsibilities**:
  - Displays Title, Subtitle, and Description.
  - Fetches a high-resolution poster using a dedicated `imageSlotId` provided by the backend.
  - Handles the "Back" button logic (calling `FetchHome`).

#### `MediaItemView.cs`
The script attached to individual grid items.
- **Responsibilities**:
  - Displays text and image content.
  - Handles the **OnClick** event.
  - **Important**: This script must be triggered by a Unity UI Button using `UdonBehaviour.SendCustomEvent("OnClick")`.

## Project Organization

### Assets/Prefabs Structure
We organize prefabs by their functional role in the application:

#### `elements/`
Reusable UI building blocks that are spawned or repeated.
- `MediaItem.prefab`: The individual card representing a movie/show in the grid. Contains the `MediaItemView` script, a Button for interaction, and image/text components.

#### `managers/`
Logic-heavy prefabs that handle data processing and state.
- `APIManager.prefab`: The singleton-like object holding URL configs and the `APIManager` script.
- `MediaGridManager.prefab`: Controls the Grid view logic.
- `MediaDetailManager.prefab`: Controls the Details view logic.

#### `screens/`
High-level UI layouts (Canvas panels) corresponding to specific application states.
- `MediaUIGrid.prefab`: The visual layout for the Grid screen (likely contains the ScrollView and content area). Includes MediaGridManager.
- `MediaUIDetail.prefab`: The visual layout for the Details screen (Poster, Title, Description, Back Button). Includes MediaDetailManager.
- `MediaUIError.prefab`: Fallback screen for connection errors.

#### Root Level
- `MediaApp.prefab`: The "Master Prefab" that assembles all the above pieces (Screens + Managers) into a single drag-and-drop GameObject for easy scene setup.

## Data Flow Example (Clicking a Movie)

1. **User Clicks Item**: `MediaItemView.OnClick()` is fired.
2. **Request**: `MediaGridManager` calls `APIManager.FetchSlot(actionSlotId)`.
3. **Network**: `APIManager` requests `https://our-server.com/api/ui/slots/5`.
4. **Response**: Backend returns JSON:
   ```json
   {
     "screenType": "details",
     "title": "Big Buck Bunny",
     "imageSlotId": 12
   }
   ```
5. **Routing**: `APIManager` sees `screenType: "details"`, hides Grid, shows Detail screen, and passes data.
6. **Rendering**: `MediaDetailManager` updates text fields.
7. **Image Fetch**: `MediaDetailManager` requests image from Slot #12 (`.../imgs/slots/12.jpg`).
8. **Display**: Image arrives and is displayed on the Detail poster.

## Developer Notes
- **URL Generation**: Use the custom inspector on `APIManager` to batch-generate the 100+ slot URLs needed for the system to work.
- **Debugging**: Most scripts have a `verboseLogging` toggle. Check the VRChat debug console (Right Shift + Backtick + 3) for logs.
- **Prefabs**: 
  - `MediaItem`: Ensure the Button component's OnClick event is wired to the `MediaItemView` component (even if it's on the same object).
