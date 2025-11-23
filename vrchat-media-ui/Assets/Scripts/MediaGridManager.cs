
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.SDK3.Image;
using VRC.Udon;

public class MediaGridManager : UdonSharpBehaviour
{
    [Header("Configuration")]
    public GameObject itemPrefab;
    public Transform contentRoot;
    
    [Header("Generator Settings")]
    public string[] serviceUrls = new string[] { "http://localhost:4000" };
    public string urlPattern = "/imgs/slots/{0}.jpg";
    public int slotsPerService = 100;

    [Header("Data Source")]
    public VRCUrl[] mockImageUrls; 

    [Header("Debug")]
    public bool loadOnStart = true;

    // State
    private MediaItemView[] _spawnedItems;
    private VRCUrl[] _itemAtlasUrls;
    private Rect[] _itemUvs;
    private int _itemCount;
    
    private IVRCImageDownload[] _activeDownloads;
    private VRCUrl[] _activeDownloadUrls;
    private int _activeDownloadCount;

    private VRCImageDownloader _downloader;

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

        if (loadOnStart)
        {
            LoadMockData();
        }
    }

    public void LoadMockData()
    {
        if (mockImageUrls == null || mockImageUrls.Length == 0)
        {
            Debug.LogError("[MediaGridManager] No mockImageUrls defined!");
            return;
        }

        // Use the first URL as our "Atlas"
        VRCUrl atlasUrl = mockImageUrls[0];

        // Mock 3x2 Grid of UVs
        // Row 0 (Bottom)
        CreateItem("Inception", "2010", atlasUrl, new Rect(0.0f, 0.0f, 0.33f, 0.5f));
        CreateItem("The Dark Knight", "2008", atlasUrl, new Rect(0.33f, 0.0f, 0.33f, 0.5f));
        CreateItem("Interstellar", "2014", atlasUrl, new Rect(0.66f, 0.0f, 0.33f, 0.5f));
        
        // Row 1 (Top)
        CreateItem("Dunkirk", "2017", atlasUrl, new Rect(0.0f, 0.5f, 0.33f, 0.5f));
        CreateItem("Tenet", "2020", atlasUrl, new Rect(0.33f, 0.5f, 0.33f, 0.5f));
        CreateItem("Oppenheimer", "2023", atlasUrl, new Rect(0.66f, 0.5f, 0.33f, 0.5f));

        // Trigger download for the atlas
        RequestAtlas(atlasUrl);
    }

    void CreateItem(string title, string subtitle, VRCUrl atlasUrl, Rect uv)
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
            // Image will be set when atlas loads
        }

        // Store state
        _spawnedItems[_itemCount] = view;
        _itemAtlasUrls[_itemCount] = atlasUrl;
        _itemUvs[_itemCount] = uv;
        _itemCount++;
    }

    void RequestAtlas(VRCUrl url)
    {
        // Check if already downloading or downloaded (not tracking downloaded yet, just simple check)
        // For simplicity, just check active downloads
        for (int i = 0; i < _activeDownloadCount; i++)
        {
            if (_activeDownloadUrls[i] != null && _activeDownloadUrls[i].Equals(url))
            {
                return; // Already in progress
            }
        }

        if (_activeDownloadCount >= _activeDownloads.Length)
        {
            Debug.LogError("[MediaGridManager] Too many active downloads!");
            return;
        }

        // Start download
        // Note: UdonBehaviour must be cast to UdonBehaviour for the callback target
        IVRCImageDownload download = _downloader.DownloadImage(url, null, (UdonBehaviour)this.GetComponent(typeof(UdonBehaviour)), null);
        
        _activeDownloads[_activeDownloadCount] = download;
        _activeDownloadUrls[_activeDownloadCount] = url;
        _activeDownloadCount++;
    }

    public override void OnImageLoadSuccess(IVRCImageDownload result)
    {
        // Find which URL this was
        VRCUrl matchedUrl = null;
        int matchedIndex = -1;

        // Note: result object equality check
        for (int i = 0; i < _activeDownloadCount; i++)
        {
            // We assume result is the same object we got from DownloadImage
            // If not, we might need another way, but usually it is.
            // If this equality fails, we have to rely on something else or assume single download.
            if (_activeDownloads[i] == result)
            {
                matchedUrl = _activeDownloadUrls[i];
                matchedIndex = i;
                break;
            }
        }

        if (matchedUrl == null)
        {
            Debug.LogWarning("[MediaGridManager] Received load success for unknown download.");
            return;
        }

        Texture2D texture = result.Result;

        // Assign to all items that use this atlas
        for (int i = 0; i < _itemCount; i++)
        {
            if (_itemAtlasUrls[i].Equals(matchedUrl))
            {
                if (_spawnedItems[i] != null)
                {
                    _spawnedItems[i].SetImage(texture, _itemUvs[i]);
                }
            }
        }

        // Cleanup download slot
        // (Simple array shift or replace with last)
        _activeDownloads[matchedIndex] = _activeDownloads[_activeDownloadCount - 1];
        _activeDownloadUrls[matchedIndex] = _activeDownloadUrls[_activeDownloadCount - 1];
        _activeDownloadCount--;
    }

    public override void OnImageLoadError(IVRCImageDownload result)
    {
        Debug.LogError($"[MediaGridManager] Atlas download failed: {result.ErrorMessage}");
        // Cleanup similar to Success
        // ... (Copy paste cleanup logic or refactor)
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
}
