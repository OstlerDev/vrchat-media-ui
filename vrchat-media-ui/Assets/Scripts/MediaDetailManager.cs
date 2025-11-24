using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using VRC.SDKBase;
using VRC.SDK3.Data;
using VRC.SDK3.Image;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class MediaDetailManager : UdonSharpBehaviour
{
    [Header("UI Components")]
    public TextMeshProUGUI titleText;
    public TextMeshProUGUI subtitleText;
    public TextMeshProUGUI descriptionText;
    public RawImage posterImage;
    
    [Header("References")]
    public APIManager apiManager;

    private VRCImageDownloader _imageDownloader;

    void Start()
    {
        _imageDownloader = new VRCImageDownloader();
    }
    
    public void OnApiResponse(DataDictionary data)
    {
        if (data.ContainsKey("title")) 
        {
            if (titleText != null) titleText.text = data["title"].String;
        }
        
        if (data.ContainsKey("subtitle")) 
        {
            if (subtitleText != null) subtitleText.text = data["subtitle"].String;
        }

        if (data.ContainsKey("description")) 
        {
            if (descriptionText != null) descriptionText.text = data["description"].String;
        }

        if (data.ContainsKey("imageSlotId"))
        {
            int imageSlotId = (int)data["imageSlotId"].Number;
            if (apiManager != null)
            {
                VRCUrl url = apiManager.GetImageSlotUrl(imageSlotId);
                if (url != null)
                {
                    Debug.Log($"[MediaDetailManager] Requesting poster from slot {imageSlotId}: {url}");
                    _imageDownloader.DownloadImage(url, null, (UdonBehaviour)this.GetComponent(typeof(UdonBehaviour)), null);
                }
            }
        }

        // Show this screen
        this.gameObject.SetActive(true);
    }
    
    public override void OnImageLoadSuccess(IVRCImageDownload result)
    {
        Debug.Log("[MediaDetailManager] Poster loaded successfully");
        if (posterImage != null)
        {
            posterImage.texture = result.Result;
            posterImage.uvRect = new Rect(0, 0, 1, 1);
        }
    }

    public override void OnImageLoadError(IVRCImageDownload result)
    {
        Debug.LogError($"[MediaDetailManager] Poster download failed: {result.ErrorMessage}");
    }
    
    public void OnBackClicked()
    {
        if (apiManager != null)
        {
            apiManager.FetchHome();
        }
    }

    public void Hide()
    {
        this.gameObject.SetActive(false);
    }
}
