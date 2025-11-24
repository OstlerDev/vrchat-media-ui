using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using VRC.SDKBase;
using VRC.SDK3.Data;
using VRC.SDK3.Image;
using VRC.Udon;
using VVMWCore = JLChnToZ.VRC.VVMW.Core;

[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class MediaDetailManager : UdonSharpBehaviour
{
    [Header("UI Components")]
    public TextMeshProUGUI titleText;
    public TextMeshProUGUI subtitleText;
    public TextMeshProUGUI descriptionText;
    public RawImage posterImage;
    public MediaUIButton playButton;
    
    [Header("References")]
    public APIManager apiManager;
    public VVMWCore videoPlayer;

    private VRCImageDownloader _imageDownloader;
    private int _streamSlotId = -1;

    void Start()
    {
        _imageDownloader = new VRCImageDownloader();
        if (playButton != null)
        {
            playButton.targetBehaviour = (UdonBehaviour)GetComponent(typeof(UdonBehaviour));
            playButton.eventName = "PlayMovie";
        }
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

        if (data.ContainsKey("streamSlotId"))
        {
             _streamSlotId = (int)data["streamSlotId"].Number;
        }
        else
        {
             _streamSlotId = -1;
        }

        // Show this screen
        this.gameObject.SetActive(true);
    }
    
    public void PlayMovie()
    {
        if (_streamSlotId < 0)
        {
            Debug.LogError("[MediaDetailManager] No stream slot assigned!");
            return;
        }

        if (apiManager == null) return;

        VRCUrl url = apiManager.GetStreamSlotUrl(_streamSlotId);
        if (url == null)
        {
            Debug.LogError($"[MediaDetailManager] Could not resolve URL for stream slot {_streamSlotId}");
            return;
        }

        if (videoPlayer != null)
        {
            Debug.Log($"[MediaDetailManager] Playing movie from URL: {url}");
            byte type = videoPlayer.GetSuitablePlayerType(url);
            if (type > 0)
            {
                videoPlayer.PlayUrl(url, type);
                videoPlayer.Play(); // Ensure playback starts
            }
            else
            {
                Debug.LogError("[MediaDetailManager] No suitable player found for this URL!");
            }
        } else {
            Debug.LogError("[MediaDetailManager] Video player reference is missing!");
        }
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

    public override void Interact()
    {
        PlayMovie();
    }
}
