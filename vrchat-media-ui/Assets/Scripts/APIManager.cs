
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.SDK3.StringLoading;
using VRC.SDK3.Data;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class APIManager : UdonSharpBehaviour
{
    [Header("Endpoints")]
    public VRCUrl homeUrl;
    public VRCUrl[] slotUrls; // API Slots: /api/ui/slots/0...
    public VRCUrl[] imageSlotUrls; // Image Slots: /imgs/slots/0...

    [Header("Screens")]
    public MediaGridManager gridManager;
    public MediaDetailManager detailManager;

    // We can track what we requested to know how to handle the response
    // 0 = Home, 1 = Slot
    private int _lastRequestType = -1; 
    private int _lastRequestedSlotId = -1;

    public void FetchHome()
    {
        if (homeUrl == null) 
        {
            Debug.LogError("[APIManager] Home URL is null!");
            return;
        }
        _lastRequestType = 0;
        Debug.Log($"[APIManager] Fetching Home URL: {homeUrl}");
        VRCStringDownloader.LoadUrl(homeUrl, (UdonBehaviour)this.GetComponent(typeof(UdonBehaviour)));
    }

    public void FetchSlot(int slotId)
    {
        if (slotUrls == null || slotUrls.Length == 0) 
        {
            Debug.LogError("[APIManager] Slot URLs not configured!");
            return;
        }
        
        // Modulo to wrap around if we have fewer URLs than slots (though backend should align)
        int urlIndex = slotId % slotUrls.Length;
        VRCUrl url = slotUrls[urlIndex];
        
        _lastRequestType = 1;
        _lastRequestedSlotId = slotId;
        
        Debug.Log($"[APIManager] Fetching Slot {slotId} using URL: {url}");
        VRCStringDownloader.LoadUrl(url, (UdonBehaviour)this.GetComponent(typeof(UdonBehaviour)));
    }

    public override void OnStringLoadSuccess(IVRCStringDownload result)
    {
        string json = result.Result;
        Debug.Log("[APIManager] received JSON response");
        
        // Parse JSON using VRCJson
        if (VRCJson.TryDeserializeFromJson(json, out DataToken data))
        {
            if (data.TokenType == TokenType.DataDictionary)
            {
                DataDictionary dict = data.DataDictionary;
                
                // Check for errors
                if (dict.ContainsKey("screenType"))
                {
                    string screenType = dict["screenType"].String;
                    Debug.Log($"[APIManager] Screen Type: {screenType}");
                    
                    if (screenType == "error")
                    {
                        Debug.LogError("[APIManager] Server returned error: " + (dict.ContainsKey("message") ? dict["message"].String : "Unknown"));
                        return;
                    }

                    RouteResponse(screenType, dict);
                }
                else
                {
                    Debug.Log("[APIManager] no screen type found");
                }
            }
        }
        else
        {
            Debug.LogError("[APIManager] Failed to parse JSON");
        }
    }

    void RouteResponse(string screenType, DataDictionary data)
    {
        // Simple Routing Logic: Toggle visibility based on screen type
        if (screenType == "grid" || screenType == "home")
        {
            if (gridManager != null)
            {
                gridManager.gameObject.SetActive(true);
                gridManager.OnApiResponse(data);
            }
            if (detailManager != null) detailManager.Hide();
        }
        else if (screenType == "details")
        {
            if (detailManager != null)
            {
                detailManager.gameObject.SetActive(true);
                detailManager.OnApiResponse(data);
            }
            if (gridManager != null) gridManager.gameObject.SetActive(false);
        }
    }

    public override void OnStringLoadError(IVRCStringDownload result)
    {
        Debug.LogError($"[APIManager] Download failed (Type: {_lastRequestType}): {result.Error}");
    }
    
    public VRCUrl GetImageSlotUrl(int slotId)
    {
        if (imageSlotUrls == null || imageSlotUrls.Length == 0) return null;
        return imageSlotUrls[slotId % imageSlotUrls.Length];
    }
}
