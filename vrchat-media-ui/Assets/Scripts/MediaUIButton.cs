using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDKBase;
using VRC.Udon;

[UdonBehaviourSyncMode(BehaviourSyncMode.None)]
public class MediaUIButton : UdonSharpBehaviour
{
    [Header("Events")]
    public UdonBehaviour targetBehaviour;
    public string eventName;
    
    public override void Interact()
    {
        if (targetBehaviour != null && !string.IsNullOrEmpty(eventName))
        {
            targetBehaviour.SendCustomEvent(eventName);
        }
    }

    // Allow other scripts to trigger the click (e.g. UI Button component)
    public void OnClick()
    {
        Interact();
    }
}
