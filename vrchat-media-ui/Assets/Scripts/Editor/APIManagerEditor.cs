
using UnityEngine;
using UnityEditor;
using VRC.SDKBase;
using System.Collections.Generic;

[CustomEditor(typeof(APIManager))]
public class APIManagerEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();

        APIManager manager = (APIManager)target;

        EditorGUILayout.Space();
        EditorGUILayout.LabelField("URL Generator", EditorStyles.boldLabel);

        // We can reuse the settings from MediaGridManager or just add basic fields here
        // Since APIManager is separate, it might be cleaner to just have a simple base URL field
        // But let's assume we want to stick to the same pattern of serviceUrls + slot count
        
        // For simplicity, let's just ask for the base service URL and slot count here temporarily
        // Or we could reference a config object. 
        // Let's add fields to this Editor window for generation purposes only.

        GUILayout.BeginVertical("box");
        GUILayout.Label("Generator Settings (Not saved to component)", EditorStyles.boldLabel);
        
        string serviceUrl = EditorGUILayout.TextField("Service URL", "http://localhost:4000");
        int slotCount = EditorGUILayout.IntField("Slot Count", 100);
        
        if (GUILayout.Button("Generate API Slot URLs"))
        {
            GenerateApiUrls(manager, serviceUrl, slotCount);
        }
        GUILayout.EndVertical();
    }

    void GenerateApiUrls(APIManager manager, string serviceUrl, int count)
    {
        if (string.IsNullOrEmpty(serviceUrl))
        {
            Debug.LogError("Service URL cannot be empty.");
            return;
        }

        List<VRCUrl> urls = new List<VRCUrl>();
        string baseService = serviceUrl.TrimEnd('/');

        // Generate Home URL
        manager.homeUrl = new VRCUrl(baseService + "/api/ui/home");

        // Generate Slot URLs
        for (int i = 0; i < count; i++)
        {
            string url = $"{baseService}/api/ui/slots/{i}";
            urls.Add(new VRCUrl(url));
        }

        manager.slotUrls = urls.ToArray();
        
        EditorUtility.SetDirty(manager);
        Debug.Log($"Generated Home URL and {urls.Count} API slot URLs.");
    }
}

