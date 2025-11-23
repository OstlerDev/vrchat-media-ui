
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
    public VRCUrl[] slotUrls; // Populate this in Inspector with /api/ui/slots/0 ... /api/ui/slots/99

    [Header("References")]
    public MediaGridManager gridManager;

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
            Debug.Log("[APIManager] parsed JSON response");
            if (data.TokenType == TokenType.DataDictionary)
            {
                Debug.Log("[APIManager] data dictionary found");
                DataDictionary dict = data.DataDictionary;
                
                // Check for errors
                if (dict.ContainsKey("screenType"))
                {
                    Debug.Log("[APIManager] screen type found");
                    string screenType = dict["screenType"].String;
                    
                    if (screenType == "error")
                    {
                        Debug.LogError("[APIManager] Server returned error: " + (dict.ContainsKey("message") ? dict["message"].String : "Unknown"));
                        return;
                    }

                    // Dispatch to Grid Manager
                    if (gridManager != null)
                    {
                        Debug.Log("[APIManager] dispatching to grid manager");
                        gridManager.OnApiResponse(dict);
                    }
                }
                else
                {
                    Debug.Log("[APIManager] no screen type found");
                }
            }
            else
            {
                Debug.Log("[APIManager] no data dictionary found");
            }
        }
        else
        {
            Debug.LogError("[APIManager] Failed to parse JSON");
        }
    }

    public override void OnStringLoadError(IVRCStringDownload result)
    {
        Debug.LogError($"[APIManager] Download failed (Type: {_lastRequestType}): {result.Error}");
    }
}
