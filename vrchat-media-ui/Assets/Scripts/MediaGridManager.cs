
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.SDK3.Image;
using VRC.SDK3.StringLoading;
using VRC.SDK3.Data;
using VRC.Udon;

public class MediaGridManager : UdonSharpBehaviour
{
    [Header("Configuration")]
    public GameObject itemPrefab;
    public Transform contentRoot;
    public APIManager apiManager;
    
    // Removed local generator settings as they are now in APIManagerEditor
    
    [Header("Atlas Settings")]
    // These must match the server constants (2048x2048 atlas, 256x384 thumbs)
    public int atlasCols = 8;
    public int atlasRows = 5; 

    // Removed local imageSlotUrls as we fetch from APIManager

    [Header("Debug")]
    public bool loadOnStart = true;
    public bool verboseLogging = true;

    // State
    private MediaItemView[] _spawnedItems;
    private VRCUrl[] _itemAtlasUrls;
    private Rect[] _itemUvs;
    private int _itemCount;
    
    private IVRCImageDownload[] _activeDownloads;
    private VRCUrl[] _activeDownloadUrls;
    private int _activeDownloadCount;

    private VRCImageDownloader _downloader;

    // Cached UVs
    private float _uvW;
    private float _uvH;

    void Start()
    {
        _downloader = new VRCImageDownloader();
        _spawnedItems = new MediaItemView[100];
        _itemAtlasUrls = new VRCUrl[100];
        _itemUvs = new Rect[100];
        _itemCount = 0;

        _activeDownloads = new IVRCImageDownload[10];
        _activeDownloadUrls = new VRCUrl[10];
        _activeDownloadCount = 0;

        _uvW = 1.0f / (float)atlasCols;
        _uvH = 384.0f / 2048.0f; 

        if (loadOnStart && apiManager != null)
        {
            if (verboseLogging) Debug.Log("[MediaGridManager] Fetching Home...");
            apiManager.FetchHome();
            if (verboseLogging) Debug.Log("[MediaGridManager] Home fetched.");
        }
    }

    public void OnApiResponse(DataDictionary data)
    {
        if (verboseLogging) Debug.Log("[MediaGridManager] Received API Response (Manual Public Call check)");
        
        // Clear existing items
        ClearItems();

        if (data.ContainsKey("items"))
        {
            DataList items = data["items"].DataList;
            if (verboseLogging) Debug.Log($"[MediaGridManager] Processing {items.Count} items.");

            for (int i = 0; i < items.Count; i++)
            {
                DataDictionary item = items[i].DataDictionary;
                
                string title = "Unknown";
                if (item.ContainsKey("label")) title = item["label"].String;

                string subtitle = "";
                if (item.ContainsKey("subLabel")) subtitle = item["subLabel"].String;

                int imageSlotId = -1;
                if (item.ContainsKey("slotId")) imageSlotId = (int)item["slotId"].Number;

                int actionSlotId = -1;
                if (item.ContainsKey("actionSlotId")) actionSlotId = (int)item["actionSlotId"].Number;
                
                int atlasIndex = -1;
                if (item.ContainsKey("atlasIndex")) atlasIndex = (int)item["atlasIndex"].Number;
                
                if (imageSlotId >= 0 && atlasIndex >= 0)
                {
                    Rect uv = CalculateUV(atlasIndex);

                    // Fetch URL from APIManager instead of local array
                    if (apiManager != null)
                    {
                        VRCUrl atlasUrl = apiManager.GetImageSlotUrl(imageSlotId);
                        if (atlasUrl != null)
                        {
                            CreateItem(title, subtitle, atlasUrl, uv, actionSlotId);
                            RequestAtlas(atlasUrl);
                        }
                        else
                        {
                             if (verboseLogging) Debug.LogError($"[MediaGridManager] APIManager returned null URL for slot {imageSlotId}");
                        }
                    }
                    else
                    {
                        if (verboseLogging) Debug.LogError("[MediaGridManager] APIManager reference missing!");
                    }
                }
                else
                {
                     if (verboseLogging) Debug.LogWarning($"[MediaGridManager] Item {i} missing slotId or atlasIndex.");
                }
            }
        }
        else
        {
             if (verboseLogging) Debug.LogWarning("[MediaGridManager] Response missing 'items' list.");
        }
    }
    
    Rect CalculateUV(int index)
    {
        int col = index % atlasCols;
        int row = index / atlasCols;

        float x = col * _uvW;
        float y = 1.0f - ((row + 1) * _uvH);

        return new Rect(x, y, _uvW, _uvH);
    }

    public void OnItemClicked(int actionSlotId)
    {
        if (verboseLogging) Debug.Log($"[MediaGridManager] Item clicked, requesting slot {actionSlotId}");
        if (apiManager != null)
        {
            apiManager.FetchSlot(actionSlotId);
        }
    }

    void ClearItems()
    {
        for (int i = 0; i < _itemCount; i++)
        {
            if (_spawnedItems[i] != null)
            {
                Destroy(_spawnedItems[i].gameObject);
            }
        }
        _itemCount = 0;
    }

    void CreateItem(string title, string subtitle, VRCUrl atlasUrl, Rect uv, int actionSlotId)
    {
        if (itemPrefab == null || contentRoot == null) return;
        if (_itemCount >= _spawnedItems.Length) return;

        GameObject newItem = Object.Instantiate(itemPrefab, contentRoot);
        newItem.transform.localScale = Vector3.one;
        newItem.transform.localPosition = Vector3.zero;
        
        MediaItemView view = newItem.GetComponent<MediaItemView>();
        if (view != null)
        {
            view.SetContent(title, subtitle);
            view.SetAction(actionSlotId, this);
        }

        // Store state
        _spawnedItems[_itemCount] = view;
        _itemAtlasUrls[_itemCount] = atlasUrl;
        _itemUvs[_itemCount] = uv;
        _itemCount++;
    }

    void RequestAtlas(VRCUrl url)
    {
        for (int i = 0; i < _activeDownloadCount; i++)
        {
            if (_activeDownloadUrls[i] != null && _activeDownloadUrls[i].Equals(url))
            {
                return; 
            }
        }

        if (_activeDownloadCount >= _activeDownloads.Length)
        {
            if (verboseLogging) Debug.LogWarning("[MediaGridManager] Too many active downloads!");
            return;
        }

        if (verboseLogging) Debug.Log($"[MediaGridManager] Requesting Atlas: {url}");

        IVRCImageDownload download = _downloader.DownloadImage(url, null, (UdonBehaviour)this.GetComponent(typeof(UdonBehaviour)), null);
        
        _activeDownloads[_activeDownloadCount] = download;
        _activeDownloadUrls[_activeDownloadCount] = url;
        _activeDownloadCount++;
    }

    public override void OnImageLoadSuccess(IVRCImageDownload result)
    {
        VRCUrl matchedUrl = null;
        int matchedIndex = -1;

        for (int i = 0; i < _activeDownloadCount; i++)
        {
            if (_activeDownloads[i] == result)
            {
                matchedUrl = _activeDownloadUrls[i];
                matchedIndex = i;
                break;
            }
        }

        if (matchedUrl == null) 
        {
            if (verboseLogging) Debug.LogWarning("[MediaGridManager] Unknown download success.");
            return;
        }
        
        if (verboseLogging) Debug.Log($"[MediaGridManager] Atlas Loaded: {matchedUrl}");

        Texture2D texture = result.Result;

        int updateCount = 0;
        for (int i = 0; i < _itemCount; i++)
        {
            if (_itemAtlasUrls[i].Equals(matchedUrl))
            {
                if (_spawnedItems[i] != null)
                {
                    _spawnedItems[i].SetImage(texture, _itemUvs[i]);
                    updateCount++;
                }
            }
        }
        
        if (verboseLogging) Debug.Log($"[MediaGridManager] Updated {updateCount} items with new atlas.");

        _activeDownloads[matchedIndex] = _activeDownloads[_activeDownloadCount - 1];
        _activeDownloadUrls[matchedIndex] = _activeDownloadUrls[_activeDownloadCount - 1];
        _activeDownloadCount--;
    }

    public override void OnImageLoadError(IVRCImageDownload result)
    {
        Debug.LogError($"[MediaGridManager] Atlas download failed: {result.ErrorMessage}");
        
         for (int i = 0; i < _activeDownloadCount; i++)
        {
            if (_activeDownloads[i] == result)
            {
                _activeDownloads[i] = _activeDownloads[_activeDownloadCount - 1];
                _activeDownloadUrls[i] = _activeDownloadUrls[_activeDownloadCount - 1];
                _activeDownloadCount--;
                break;
            }
        }
    }

    public override void OnStringLoadSuccess(IVRCStringDownload result)
    {
        if (verboseLogging) Debug.LogWarning("[MediaGridManager] Caught String Load Event! Forwarding to APIManager.");
        if (apiManager != null)
        {
            apiManager.OnStringLoadSuccess(result);
        }
    }

    public override void OnStringLoadError(IVRCStringDownload result)
    {
        if (verboseLogging) Debug.LogError("[MediaGridManager] Caught String Load Error! Forwarding to APIManager.");
        if (apiManager != null)
        {
            apiManager.OnStringLoadError(result);
        }
    }
}
