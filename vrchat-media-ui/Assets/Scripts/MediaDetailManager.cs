
using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using VRC.SDK3.Data;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class MediaDetailManager : UdonSharpBehaviour
{
    [Header("UI Components")]
    public TextMeshProUGUI titleText;
    public TextMeshProUGUI subtitleText;
    public TextMeshProUGUI descriptionText;
    
    [Header("References")]
    public APIManager apiManager;

    // We'll add image handling later when the server provides a poster slot for details
    
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

        // Show this screen
        this.gameObject.SetActive(true);
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

