
using UnityEngine;
using UnityEditor;
using VRC.SDKBase;
using System.Collections.Generic;

[CustomEditor(typeof(MediaGridManager))]
public class MediaGridManagerEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();

        MediaGridManager manager = (MediaGridManager)target;

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("URL Generator", EditorStyles.boldLabel);

        if (GUILayout.Button("Generate Slot URLs"))
        {
            GenerateSlotUrls(manager);
        }
    }

    void GenerateSlotUrls(MediaGridManager manager)
    {
        if (manager.serviceUrls == null || manager.serviceUrls.Length == 0)
        {
            Debug.LogError("No Service URLs defined.");
            return;
        }

        List<VRCUrl> allUrls = new List<VRCUrl>();
        int slots = manager.slotsPerService;
        if (slots <= 0) slots = 100; // Default safe guard
        
        string pattern = manager.urlPattern;
        if (string.IsNullOrEmpty(pattern)) pattern = "/imgs/slots/{0}.jpg";

        foreach (string serviceUrl in manager.serviceUrls)
        {
            // Normalize base URL to NOT have trailing slash
            string baseService = serviceUrl.TrimEnd('/');
            
            for (int i = 0; i < slots; i++)
            {
                // Format the path
                string path = string.Format(pattern, i);
                
                // Ensure path starts with /
                if (!path.StartsWith("/")) path = "/" + path;

                string fullUrl = baseService + path;
                allUrls.Add(new VRCUrl(fullUrl));
            }
        }

        manager.mockImageUrls = allUrls.ToArray();
        
        // Mark object as dirty to save changes to the scene/prefab
        EditorUtility.SetDirty(manager);
        Debug.Log($"Generated {allUrls.Count} mock URLs from {manager.serviceUrls.Length} services ({slots} slots each).");
    }
}
