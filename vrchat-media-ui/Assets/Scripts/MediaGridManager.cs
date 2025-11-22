
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.Udon;

public class MediaGridManager : UdonSharpBehaviour
{
    [Header("Configuration")]
    public GameObject itemPrefab;
    public Transform contentRoot;
    
    [Header("Generator Settings")]
    [Tooltip("Base URLs for your services (e.g. http://localhost:4000). The generator will create slots for each.")]
    public string[] serviceUrls = new string[] { "http://localhost:4000" };
    
    [Tooltip("Path pattern to append to service URL. Use {0} for the slot index.")]
    public string urlPattern = "/imgs/slots/{0}.jpg";
    
    [Tooltip("How many slots to generate per service URL.")]
    public int slotsPerService = 100;

    [Header("Data Source")]
    // We must define these in the inspector because creating VRCUrl from string 
    // is not supported in older SDK versions without the allowlist feature.
    public VRCUrl[] mockImageUrls; 

    [Header("Debug")]
    public bool loadOnStart = true;

    void Start()
    {
        if (loadOnStart)
        {
            LoadMockData();
        }
    }

    public void LoadMockData()
    {
        // Prevent crash if no URLs set
        if (mockImageUrls == null || mockImageUrls.Length == 0)
        {
            Debug.LogError("[MediaGridManager] No mockImageUrls defined in Inspector!");
            return;
        }

        // Helper to get a URL safely (looping if we run out)
        // Using simple modulo to pick images
        
        CreateItem("Inception", "2010 · Movie", GetUrlSafe(0));
        CreateItem("The Dark Knight", "2008 · Movie", GetUrlSafe(1));
        CreateItem("Interstellar", "2014 · Movie", GetUrlSafe(2));
        CreateItem("Dunkirk", "2017 · Movie", GetUrlSafe(3));
        CreateItem("Tenet", "2020 · Movie", GetUrlSafe(4));
        CreateItem("Oppenheimer", "2023 · Movie", GetUrlSafe(5));
    }

    VRCUrl GetUrlSafe(int index)
    {
        if (mockImageUrls == null || mockImageUrls.Length == 0) return VRCUrl.Empty;
        return mockImageUrls[index % mockImageUrls.Length];
    }

    void CreateItem(string title, string subtitle, VRCUrl url)
    {
        if (itemPrefab == null || contentRoot == null) return;

        GameObject newItem = Object.Instantiate(itemPrefab, contentRoot);
        // Reset scale/pos just in case
        newItem.transform.localScale = Vector3.one;
        newItem.transform.localPosition = Vector3.zero;
        
        MediaItemView view = newItem.GetComponent<MediaItemView>();
        if (view != null)
        {
            view.SetContent(title, subtitle, url);
        }
    }
}
