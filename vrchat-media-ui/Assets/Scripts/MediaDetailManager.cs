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
    public RawImage backdropImage;
    public MediaUIButton playButton;
    
    [Header("References")]
    public APIManager apiManager;
    public VVMWCore videoPlayer;

    private VRCImageDownloader _imageDownloader;
    private int _streamSlotId = -1;
    
    // We now only download one image (the atlas)
    private IVRCImageDownload _atlasDownload;

    // Stored UVs to apply when atlas loads
    private Rect _posterRect;
    private Rect _backdropRect;

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

        // Default UVs if not provided
        _posterRect = new Rect(0, 0, 1, 1);
        _backdropRect = new Rect(0, 0, 1, 1);

        if (data.ContainsKey("posterUV"))
        {
            _posterRect = ParseRect(data["posterUV"].DataDictionary);
        }

        if (data.ContainsKey("backdropUV"))
        {
            _backdropRect = ParseRect(data["backdropUV"].DataDictionary);
        }

        if (data.ContainsKey("atlasSlotId"))
        {
            int atlasSlotId = (int)data["atlasSlotId"].Number;
            if (apiManager != null)
            {
                VRCUrl url = apiManager.GetImageSlotUrl(atlasSlotId);
                if (url != null)
                {
                    Debug.Log($"[MediaDetailManager] Requesting detail atlas from slot {atlasSlotId}: {url}");
                    _atlasDownload = _imageDownloader.DownloadImage(url, null, (UdonBehaviour)this.GetComponent(typeof(UdonBehaviour)), null);
                }
            }
        }
        // Fallback to old imageSlotId if atlasSlotId is missing?
        // For now, assume new server version.

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

    private Rect ParseRect(DataDictionary dict)
    {
        if (dict == null) return new Rect(0, 0, 1, 1);
        
        float x = (float)dict["x"].Number;
        float y = (float)dict["y"].Number;
        float w = (float)dict["w"].Number;
        float h = (float)dict["h"].Number;
        
        return new Rect(x, y, w, h);
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
        if (result == _atlasDownload)
        {
            Debug.Log("[MediaDetailManager] Detail Atlas loaded successfully");
            Texture2D atlas = result.Result;

            if (posterImage != null)
            {
                posterImage.texture = atlas;
                posterImage.uvRect = _posterRect;
            }
            
            if (backdropImage != null)
            {
                backdropImage.texture = atlas;
                backdropImage.uvRect = _backdropRect;
            }
            
            _atlasDownload = null;
        }
    }

    public override void OnImageLoadError(IVRCImageDownload result)
    {
        Debug.LogError($"[MediaDetailManager] Image download failed: {result.ErrorMessage}");
        if (result == _atlasDownload) _atlasDownload = null;
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
